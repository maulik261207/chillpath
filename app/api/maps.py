import asyncio
import math
import re
import time
import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from app.core.config import get_settings
from app.schemas.maps import Coordinate, RouteRequest, RerouteRequest
from app.services.geoapify import GeoapifyClient, summarize_routes
from app.services.tomtom import TomTomClient, summarize_tomtom_routes

router = APIRouter(prefix="/maps", tags=["maps"])
_ROUTE_CACHE_TTL_SECONDS = 300
_route_cache: dict[tuple, tuple[float, dict]] = {}
_default_route_warmup_task: asyncio.Task | None = None

# A small, deterministic gazetteer keeps the hackathon route planner useful
# without provider credentials. Configured providers still take precedence.
_INDIA_CITIES = {
    "ahmedabad": (23.0225, 72.5714),
    "bangalore": (12.9716, 77.5946),
    "bengaluru": (12.9716, 77.5946),
    "bhopal": (23.2599, 77.4126),
    "chandigarh": (30.7333, 76.7794),
    "chennai": (13.0827, 80.2707),
    "coimbatore": (11.0168, 76.9558),
    "delhi": (28.6139, 77.2090),
    "gurugram": (28.4595, 77.0266),
    "hyderabad": (17.3850, 78.4867),
    "indore": (22.7196, 75.8577),
    "jaipur": (26.9124, 75.7873),
    "kochi": (9.9312, 76.2673),
    "kolkata": (22.5726, 88.3639),
    "lucknow": (26.8467, 80.9462),
    "mumbai": (19.0760, 72.8777),
    "mysore": (12.2958, 76.6394),
    "mysuru": (12.2958, 76.6394),
    "nagpur": (21.1458, 79.0882),
    "nashik": (19.9975, 73.7898),
    "new delhi": (28.6139, 77.2090),
    "noida": (28.5355, 77.3910),
    "pune": (18.5204, 73.8567),
    "surat": (21.1702, 72.8311),
    "vadodara": (22.3072, 73.1812),
    "visakhapatnam": (17.6868, 83.2185),
}


def _local_places(text: str, limit: int = 5) -> dict:
    query = re.sub(r"\s+", " ", text.split(",", 1)[0].strip().casefold())
    matches = [
        (name, location)
        for name, location in _INDIA_CITIES.items()
        if name == query or name.startswith(query)
    ]
    matches.sort(key=lambda item: (item[0] != query, len(item[0]), item[0]))
    return {
        "results": [
            {
                "formatted": f"{name.title()}, India",
                "address_line1": name.title(),
                "address_line2": "India",
                "lat": latitude,
                "lon": longitude,
                "source": "local_gazetteer",
            }
            for name, (latitude, longitude) in matches[:limit]
        ]
    }


def _haversine_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(value))


def _estimated_route(points: list[tuple[float, float]], mode: str) -> dict:
    direct_distance = sum(_haversine_meters(a, b) for a, b in zip(points, points[1:]))
    road_modes = {"scooter", "motorcycle", "drive", "bus", "light_truck", "medium_truck", "truck", "heavy_truck", "long_truck", "truck_dangerous_goods"}
    distance_factor = 1.16 if mode in road_modes else 1.08
    speeds_kmh = {
        "walk": 5, "hike": 4, "bicycle": 16, "road_bike": 22, "mountain_bike": 12,
        "scooter": 35, "motorcycle": 45, "drive": 55, "bus": 42,
        "light_truck": 50, "medium_truck": 46, "truck": 44, "heavy_truck": 40,
        "long_truck": 38, "truck_dangerous_goods": 36, "transit": 34,
        "approximated_transit": 34,
    }
    distance_m = round(direct_distance * distance_factor)
    duration_s = round(distance_m / (speeds_kmh.get(mode, 40) * 1000 / 3600))
    return {
        "routes": [{
            "mode": mode,
            "distance_m": distance_m,
            "duration_s": duration_s,
            "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in points]},
            "instructions": [],
            "provider": "estimate",
        }]
    }


def _route_cache_key(payload: RouteRequest) -> tuple:
    points = tuple((round(point.latitude, 5), round(point.longitude, 5)) for point in payload.waypoints)
    return points, payload.mode, payload.alternatives

TRANSPORT_MODES = [
    {"id": "walk", "label": "Walking", "category": "pedestrian"},
    {"id": "hike", "label": "Hiking", "category": "pedestrian"},
    {"id": "bicycle", "label": "Bicycle", "category": "cycle"},
    {"id": "road_bike", "label": "Road bicycle", "category": "cycle"},
    {"id": "mountain_bike", "label": "Mountain bicycle", "category": "cycle"},
    {"id": "scooter", "label": "Scooter", "category": "motorized"},
    {"id": "motorcycle", "label": "Motorcycle", "category": "motorized"},
    {"id": "drive", "label": "Car", "category": "road"},
    {"id": "bus", "label": "Bus", "category": "road"},
    {"id": "light_truck", "label": "Light truck", "category": "freight"},
    {"id": "medium_truck", "label": "Medium truck", "category": "freight"},
    {"id": "truck", "label": "Truck", "category": "freight"},
    {"id": "heavy_truck", "label": "Heavy truck", "category": "freight"},
    {"id": "long_truck", "label": "Long truck", "category": "freight"},
    {"id": "truck_dangerous_goods", "label": "Dangerous-goods truck", "category": "freight"},
    {"id": "transit", "label": "Public transit", "category": "transit"},
    {"id": "approximated_transit", "label": "Approximate public transit", "category": "transit"},
]

def client() -> GeoapifyClient:
    key = get_settings().geoapify_api_key
    if not key:
        raise HTTPException(503, "Geoapify is not configured")
    return GeoapifyClient(key)

@router.get("/modes")
async def transport_modes():
    return {"items": TRANSPORT_MODES}

@router.get("/tiles/{z}/{x}/{y}.png", response_class=Response)
async def map_tile(z: int, x: int, y: int):
    if not 0 <= z <= 20:
        raise HTTPException(400, "invalid map zoom")
    maximum = 2 ** z
    if not 0 <= x < maximum or not 0 <= y < maximum:
        raise HTTPException(400, "invalid map tile")
    url = f"https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png"
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            result = await http.get(url, params={"apiKey": client().api_key})
            result.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Geoapify map tile request failed") from exc
    return Response(
        content=result.content,
        media_type=result.headers.get("content-type", "image/png"),
        headers={"Cache-Control": "public, max-age=86400"},
    )

@router.get("/autocomplete")
async def autocomplete(text: str = Query(min_length=2, max_length=200), limit: int = Query(5, ge=1, le=10)):
    local = _local_places(text, limit)
    settings = get_settings()
    if local["results"]:
        return local
    if not settings.geoapify_api_key:
        return local
    try:
        result = await GeoapifyClient(settings.geoapify_api_key).autocomplete(text, limit)
        return result if result.get("results") else local
    except httpx.HTTPError:
        return local

@router.post("/route")
async def route(payload: RouteRequest):
    key = _route_cache_key(payload)
    cached = _route_cache.get(key)
    if cached and time.monotonic() - cached[0] < _ROUTE_CACHE_TTL_SECONDS:
        return cached[1]

    if key == _default_route_cache_key() and _default_route_warmup_task and not _default_route_warmup_task.done():
        await _default_route_warmup_task
        cached = _route_cache.get(key)
        if cached and time.monotonic() - cached[0] < _ROUTE_CACHE_TTL_SECONDS:
            return cached[1]

    result = await _calculate_route(payload)
    _route_cache[key] = (time.monotonic(), result)
    return result


async def _calculate_route(payload: RouteRequest) -> dict:
    points = [(point.latitude, point.longitude) for point in payload.waypoints]
    settings = get_settings()
    if settings.environment.casefold() == "local":
        return _estimated_route(points, payload.mode)
    if settings.tomtom_api_key and payload.mode in {"drive", "light_truck", "medium_truck", "truck", "heavy_truck", "long_truck", "truck_dangerous_goods"}:
        try:
            raw = await TomTomClient(settings.tomtom_api_key).route(points, payload.mode, payload.alternatives)
            routes = summarize_tomtom_routes(raw, payload.mode)
            if routes:
                return {"routes": routes}
        except httpx.HTTPError:
            # Geoapify remains a server-side fallback when TomTom is unavailable.
            pass
    if settings.geoapify_api_key:
        try:
            raw = await GeoapifyClient(settings.geoapify_api_key).route(points, payload.mode, payload.alternatives)
            routes = summarize_routes(raw, payload.mode)
            if routes:
                return {"routes": routes}
        except httpx.HTTPError:
            pass
    return _estimated_route(points, payload.mode)


async def warm_default_route() -> None:
    """Prime the real provider result before the homepage's first route request."""
    request = RouteRequest(
        waypoints=[
            Coordinate(latitude=12.9716, longitude=77.5946),
            Coordinate(latitude=12.2958, longitude=76.6394),
        ],
        mode="truck",
        alternatives=1,
    )
    try:
        result = await _calculate_route(request)
        _route_cache[_route_cache_key(request)] = (time.monotonic(), result)
    except Exception:
        # The app can still start when routing credentials or the provider are unavailable.
        return


def _default_route_cache_key() -> tuple:
    return _route_cache_key(RouteRequest(
        waypoints=[
            Coordinate(latitude=12.9716, longitude=77.5946),
            Coordinate(latitude=12.2958, longitude=76.6394),
        ],
        mode="truck",
        alternatives=1,
    ))


def schedule_default_route_warmup() -> None:
    global _default_route_warmup_task
    if _default_route_warmup_task is None or _default_route_warmup_task.done():
        _default_route_warmup_task = asyncio.create_task(warm_default_route())

@router.post("/reroute-options")
async def reroute_options(payload: RerouteRequest):
    points = [(point.latitude, point.longitude) for point in payload.waypoints]
    geo = client()
    try:
        results = await asyncio.gather(*(geo.route(points, mode) for mode in payload.modes))
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Geoapify rerouting request failed") from exc
    routes = [item for mode, result in zip(payload.modes, results) for item in summarize_routes(result, mode)]
    routes.sort(key=lambda item: ((item["duration_s"] or float("inf")), (item["distance_m"] or float("inf"))))
    return {"routes": routes, "recommended_index": 0 if routes else None, "ranking": "shortest duration, then shortest distance"}


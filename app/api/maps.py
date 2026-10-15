import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from app.core.config import get_settings
from app.schemas.maps import RouteRequest, RerouteRequest
from app.services.geoapify import GeoapifyClient, summarize_routes
from app.services.tomtom import TomTomClient, summarize_tomtom_routes

router = APIRouter(prefix="/maps", tags=["maps"])

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
    try:
        return await client().autocomplete(text, limit)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Geoapify autocomplete request failed") from exc

@router.post("/route")
async def route(payload: RouteRequest):
    points = [(point.latitude, point.longitude) for point in payload.waypoints]
    settings = get_settings()
    if settings.tomtom_api_key and payload.mode in {"drive", "light_truck", "medium_truck", "truck", "heavy_truck", "long_truck", "truck_dangerous_goods"}:
        try:
            raw = await TomTomClient(settings.tomtom_api_key).route(points, payload.mode, payload.alternatives)
            routes = summarize_tomtom_routes(raw, payload.mode)
            if routes:
                return {"routes": routes}
        except httpx.HTTPError:
            # Geoapify remains a server-side fallback when TomTom is unavailable.
            pass
    try:
        raw = await client().route(points, payload.mode, payload.alternatives)
        return {"routes": summarize_routes(raw, payload.mode)}
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Geoapify routing request failed") from exc

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


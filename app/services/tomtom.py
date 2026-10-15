from typing import Any

import httpx


BASE_URL = "https://api.tomtom.com/routing/1/calculateRoute"


class TomTomClient:
    """Server-side TomTom routing client. API credentials never reach the browser."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def route(self, waypoints: list[tuple[float, float]], mode: str, alternatives: int = 1) -> dict[str, Any]:
        locations = ":".join(f"{lat},{lon}" for lat, lon in waypoints)
        travel_mode = "truck" if "truck" in mode else "car"
        params = {
            "key": self.api_key,
            "traffic": "true",
            "travelMode": travel_mode,
            "routeType": "fastest",
            "routeRepresentation": "polyline",
            "computeTravelTimeFor": "all",
            "maxAlternatives": max(0, alternatives - 1),
        }
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{BASE_URL}/{locations}/json", params=params)
            response.raise_for_status()
            return response.json()


def summarize_tomtom_routes(payload: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    routes = []
    for route in payload.get("routes", []):
        summary = route.get("summary", {})
        points = [
            [point["longitude"], point["latitude"]]
            for leg in route.get("legs", [])
            for point in leg.get("points", [])
            if "longitude" in point and "latitude" in point
        ]
        routes.append({
            "mode": mode,
            "distance_m": summary.get("lengthInMeters"),
            "duration_s": summary.get("travelTimeInSeconds"),
            "geometry": {"type": "LineString", "coordinates": points},
            "instructions": [],
            "provider": "tomtom",
            "traffic_delay_s": summary.get("trafficDelayInSeconds", 0),
        })
    return routes

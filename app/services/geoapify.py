import asyncio
from typing import Any
import httpx

BASE_URL = "https://api.geoapify.com/v1"

class GeoapifyClient:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def autocomplete(self, text: str, limit: int = 5) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{BASE_URL}/geocode/autocomplete", params={"text": text, "limit": limit, "format": "json", "apiKey": self.api_key})
            response.raise_for_status()
            return response.json()

    async def route(self, waypoints: list[tuple[float, float]], mode: str, alternatives: int = 1) -> dict[str, Any]:
        points = "|".join(f"{lat},{lon}" for lat, lon in waypoints)
        route_types = ["balanced"]
        if alternatives > 1 and mode not in {"transit", "approximated_transit"}:
            route_types.append("short")
        if alternatives > 2 and mode in {
            "drive", "truck", "light_truck", "medium_truck", "truck_dangerous_goods",
            "heavy_truck", "long_truck", "bus",
        }:
            route_types.append("less_maneuvers")

        async def fetch(route_type: str) -> dict[str, Any]:
            params = {
                "waypoints": points,
                "mode": mode,
                "type": route_type,
                "format": "geojson",
                "details": "instruction_details",
                "apiKey": self.api_key,
            }
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.get(f"{BASE_URL}/routing", params=params)
                response.raise_for_status()
                payload = response.json()
            for feature in payload.get("features", []):
                feature.setdefault("properties", {})["optimization_type"] = route_type
            return payload

        payloads = await asyncio.gather(*(fetch(route_type) for route_type in route_types[:alternatives]))
        return {
            "type": "FeatureCollection",
            "features": [feature for payload in payloads for feature in payload.get("features", [])],
        }

def summarize_routes(payload: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    items = []
    for feature in payload.get("features", []):
        props = feature.get("properties", {})
        distance = props.get("distance")
        time = props.get("time")
        items.append({"mode": mode, "distance_m": distance, "duration_s": time, "geometry": feature.get("geometry"), "instructions": props.get("legs", []), "provider": "geoapify", "optimization_type": props.get("optimization_type")})
    return items


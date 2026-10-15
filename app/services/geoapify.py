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
        params = {"waypoints": points, "mode": mode, "format": "geojson", "details": "instruction_details", "apiKey": self.api_key}
        if alternatives > 1:
            params["route_type"] = "balanced"
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.get(f"{BASE_URL}/routing", params=params)
            response.raise_for_status()
            return response.json()

def summarize_routes(payload: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    items = []
    for feature in payload.get("features", []):
        props = feature.get("properties", {})
        distance = props.get("distance")
        time = props.get("time")
        items.append({"mode": mode, "distance_m": distance, "duration_s": time, "geometry": feature.get("geometry"), "instructions": props.get("legs", []), "provider": "geoapify"})
    return items


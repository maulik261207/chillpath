from app.services.geoapify import summarize_routes
from app.api.maps import TRANSPORT_MODES

def test_route_summary_hides_provider_credentials():
    payload = {"features": [{"properties": {"distance": 1200, "time": 300, "legs": []}, "geometry": {"type": "LineString", "coordinates": []}}]}
    result = summarize_routes(payload, "drive")[0]
    assert result["distance_m"] == 1200
    assert "apiKey" not in result

def test_all_geoapify_transport_modes_are_exposed():
    mode_ids = {item["id"] for item in TRANSPORT_MODES}
    assert {"walk", "hike", "bicycle", "motorcycle", "drive", "bus", "truck", "heavy_truck", "long_truck", "transit"} <= mode_ids

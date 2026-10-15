from app.services.geoapify import summarize_routes
from app.services.tomtom import summarize_tomtom_routes
from app.api.maps import TRANSPORT_MODES

def test_route_summary_hides_provider_credentials():
    payload = {"features": [{"properties": {"distance": 1200, "time": 300, "legs": []}, "geometry": {"type": "LineString", "coordinates": []}}]}
    result = summarize_routes(payload, "drive")[0]
    assert result["distance_m"] == 1200
    assert "apiKey" not in result

def test_all_geoapify_transport_modes_are_exposed():
    mode_ids = {item["id"] for item in TRANSPORT_MODES}
    assert {"walk", "hike", "bicycle", "motorcycle", "drive", "bus", "truck", "heavy_truck", "long_truck", "transit"} <= mode_ids


def test_tomtom_route_summary_includes_traffic_time_without_credentials():
    payload = {"routes": [{"summary": {"lengthInMeters": 142000, "travelTimeInSeconds": 9800, "trafficDelayInSeconds": 600}, "legs": [{"points": [{"latitude": 12.9, "longitude": 77.5}, {"latitude": 12.3, "longitude": 76.6}]}]}]}
    result = summarize_tomtom_routes(payload, "truck")[0]
    assert result["provider"] == "tomtom"
    assert result["distance_m"] == 142000
    assert result["traffic_delay_s"] == 600
    assert result["geometry"]["coordinates"][0] == [77.5, 12.9]
    assert "key" not in result

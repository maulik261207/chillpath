from app.services.geoapify import summarize_routes
from app.services.tomtom import summarize_tomtom_routes
from app.api.maps import TRANSPORT_MODES, _estimated_route, _local_places, _summarize_osrm

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


def test_local_city_lookup_supports_route_form_without_provider_credentials():
    result = _local_places("Pune, India")
    assert result["results"][0]["formatted"] == "Pune, India"
    assert result["results"][0]["source"] == "local_gazetteer"
    assert _local_places("Meerut")["results"][0]["formatted"] == "Meerut, India"


def test_estimated_route_changes_geometry_distance_and_duration():
    pune = (18.5204, 73.8567)
    mumbai = (19.0760, 72.8777)
    route = _estimated_route([pune, mumbai], "truck")["routes"][0]
    assert route["provider"] == "estimate"
    assert route["geometry"]["coordinates"] == [[73.8567, 18.5204], [72.8777, 19.076]]
    assert 130_000 < route["distance_m"] < 160_000
    assert route["duration_s"] > 0


def test_osrm_route_preserves_road_geometry_and_adjusts_truck_duration():
    payload = {
        "routes": [{
            "distance": 358372.9,
            "duration": 15178.3,
            "geometry": {
                "type": "LineString",
                "coordinates": [[75.7873, 26.9124], [76.4, 27.4], [77.7064, 28.9845]],
            },
        }],
    }
    route = _summarize_osrm(payload, "truck")["routes"][0]
    assert route["provider"] == "openstreetmap"
    assert route["distance_m"] == 358373
    assert route["duration_s"] == round(15178.3 * 1.16)
    assert len(route["geometry"]["coordinates"]) == 3

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_live_telemetry_flow():
    # 1. Initially no live telemetry
    res = client.get("/v1/telemetry/live")
    assert res.status_code == 200
    # Could be None or from previous run, status ok

    # 2. Ingest live telemetry from phone bluetooth gateway
    payload = {
        "device_id": "esp32-s3-test",
        "temperature_c": 28.5,
        "adc_mv": 1720,
        "voltage": 1.72,
        "do_tripped": False,
        "buzzer_active": False,
        "alarm_active": False,
        "source": "phone_ble_gateway"
    }
    post_res = client.post("/v1/telemetry/live", json=payload)
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["status"] == "ok"
    assert data["data"]["temperature_c"] == 28.5
    assert data["data"]["temperature_f"] == 83.3

    # 3. Query latest live reading
    get_res = client.get("/v1/telemetry/live")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["online"] is True
    assert get_data["data"]["temperature_c"] == 28.5

    # 4. Query history
    hist_res = client.get("/v1/telemetry/live/history?limit=10")
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert hist_data["count"] >= 1
    assert hist_data["points"][-1]["temperature_c"] == 28.5

def test_gateway_page():
    res = client.get("/gateway")
    assert res.status_code == 200
    assert "ESP32 Phone-to-Web Gateway" in res.text


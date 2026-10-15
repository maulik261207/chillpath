from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
API_KEY = "chillpath_live_secret_key"

def test_api_key_protection():
    # 1. Access without key must be 401 Unauthorized
    res = client.get("/v1/telemetry/live")
    assert res.status_code == 401
    assert "Invalid or missing API key" in res.json()["message"]


    # 2. Access with invalid key must be 401
    res = client.get("/v1/telemetry/live", headers={"X-API-Key": "wrong_key"})
    assert res.status_code == 401

    # 3. Post without key must be 401
    post_res = client.post("/v1/telemetry/live", json={"temperature_c": 25.0})
    assert post_res.status_code == 401

def test_live_telemetry_flow_with_key():
    # 1. Post live telemetry with X-API-Key header
    payload = {
        "device_id": "esp32-s3-test",
        "temperature_c": 27.5,
        "adc_mv": 1690,
        "voltage": 1.69,
        "do_tripped": False,
        "buzzer_active": False,
        "alarm_active": False,
        "source": "pc_serial_bridge"
    }
    post_res = client.post(
        "/v1/telemetry/live",
        headers={"X-API-Key": API_KEY},
        json=payload
    )
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["status"] == "ok"
    assert data["data"]["temperature_c"] == 27.5

    # 2. Query with header
    get_res = client.get("/v1/telemetry/live", headers={"X-API-Key": API_KEY})
    assert get_res.status_code == 200
    assert get_res.json()["online"] is True
    assert get_res.json()["data"]["temperature_c"] == 27.5

    # 3. Query with query parameter ?api_key=...
    get_res_query = client.get(f"/v1/telemetry/live?api_key={API_KEY}")
    assert get_res_query.status_code == 200
    assert get_res_query.json()["online"] is True

    # 4. History endpoint with key
    hist_res = client.get(f"/v1/telemetry/live/history?limit=5&api_key={API_KEY}")
    assert hist_res.status_code == 200
    assert hist_res.json()["count"] >= 1


def test_sms_alert_endpoints():
    # 1. Manual SMS dispatch endpoint with API Key
    sms_res = client.post(
        "/v1/telemetry/sms/send",
        headers={"X-API-Key": API_KEY},
        json={"phone_number": "+919557066830", "message": "Manual test alert"}
    )
    assert sms_res.status_code == 200
    assert sms_res.json()["status"] == "ok"
    assert sms_res.json()["dispatched"]["phone_number"] == "+919557066830"

    # 2. Check outbox
    outbox_res = client.get("/v1/telemetry/sms/outbox", headers={"X-API-Key": API_KEY})
    assert outbox_res.status_code == 200
    assert outbox_res.json()["count"] >= 1

    # 3. Unauthorized SMS send
    unauth = client.post("/v1/telemetry/sms/send", json={"message": "fail"})
    assert unauth.status_code == 401


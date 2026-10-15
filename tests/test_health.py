from fastapi.testclient import TestClient

from app.main import app


def test_live_health() -> None:
    response = TestClient(app).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_health_is_explicit_about_database() -> None:
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "not_checked"


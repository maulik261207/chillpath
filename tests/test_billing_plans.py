from fastapi.testclient import TestClient

from app.main import app


def test_public_plan_prices_and_minimum_term():
    with TestClient(app) as client:
        response = client.get("/v1/billing/plans")
    assert response.status_code == 200
    plans = {item["code"]: item for item in response.json()["plans"]}
    assert plans["user"]["price_minor"] == 1_000_000
    assert plans["industry_collaboration"]["price_minor"] == 10_000_000
    assert plans["subscription"]["price_minor"] == 500_000
    assert plans["subscription"]["minimum_months"] == 10
    assert plans["subscription"]["minimum_commitment_minor"] == 5_000_000

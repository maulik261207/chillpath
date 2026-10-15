from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def test_demo_organization_can_create_and_list_policy_and_shipment():
    suffix = uuid4().hex[:10]
    with TestClient(app) as client:
        registration = client.post("/v1/auth/register", json={
            "email": f"{suffix}@example.com",
            "password": "correct-horse-battery-staple",
            "organization_name": "Demo Cold Chain",
            "organization_slug": f"demo-{suffix}",
        })
        assert registration.status_code == 201
        organization_id = registration.json()["organization_id"]

        policy = client.post("/v1/product-policies", json={
            "organization_id": organization_id,
            "name": "Frozen biologic",
            "temperature_min_c": 2,
            "temperature_max_c": 8,
            "allowed_excursion_seconds": 1800,
        })
        assert policy.status_code == 201

        shipment = client.post("/v1/shipments", json={
            "organization_id": organization_id,
            "external_ref": f"CP-{suffix}",
            "product_policy_id": policy.json()["id"],
            "origin_label": "Basel, CH",
            "destination_label": "Copenhagen, DK",
        })
        assert shipment.status_code == 201

        detail = client.get(f"/v1/shipments/{shipment.json()['id']}", params={"organization_id": organization_id})
        recovery = client.get(f"/v1/shipments/{shipment.json()['id']}/recovery", params={"organization_id": organization_id})
        timeline = client.get(f"/v1/shipments/{shipment.json()['id']}/timeline", params={"organization_id": organization_id})
        route_condition = client.get(f"/v1/shipments/{shipment.json()['id']}/route-condition", params={"organization_id": organization_id})
        assert detail.status_code == 200
        assert detail.json()["external_ref"] == f"CP-{suffix}"
        assert recovery.status_code == 200
        assert recovery.json()["evidence_state"] == "insufficient_evidence"
        assert all(item["approval_status"] == "pending" for item in recovery.json()["recommendations"])
        assert timeline.status_code == 200
        assert timeline.json()["items"] == []
        assert route_condition.status_code == 200
        assert route_condition.json()["condition"] is None

        shipment_list = client.get("/v1/shipments", params={"organization_id": organization_id})
        policy_list = client.get("/v1/product-policies", params={"organization_id": organization_id})
        assert shipment_list.status_code == 200
        assert [row["id"] for row in shipment_list.json()] == [shipment.json()["id"]]
        assert policy_list.status_code == 200
        assert [row["id"] for row in policy_list.json()] == [policy.json()["id"]]

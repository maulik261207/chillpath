from uuid import uuid4
from app.schemas.devices import SensorManifestUpsert


def test_unknown_sensor_manifest_stays_hardware_tbd():
    manifest = SensorManifestUpsert(organization_id=uuid4(), sensor_id=uuid4())
    assert manifest.sensor_model == "UNCONFIRMED"
    assert manifest.capabilities == []
    assert manifest.operational_status == "HARDWARE_TBD"


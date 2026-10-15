from uuid import UUID
from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    organization_id: UUID
    hardware_uid: str = Field(min_length=1, max_length=160)
    model: str = "ESP32-S3"


class SensorManifestUpsert(BaseModel):
    organization_id: UUID
    sensor_id: UUID
    sensor_model: str = "UNCONFIRMED"
    capabilities: list[str] = Field(default_factory=list)
    unit_map: dict[str, str] = Field(default_factory=dict)
    sample_rate_hz: float | None = Field(default=None, gt=0)
    placement: str | None = None
    interface: str = "TBD"
    calibration_version: str | None = None
    is_reference_sensor: bool = False
    operational_status: str = "HARDWARE_TBD"


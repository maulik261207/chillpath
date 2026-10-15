from uuid import UUID
from pydantic import BaseModel, Field

class PolicyCreate(BaseModel):
    organization_id: UUID
    name: str
    temperature_min_c: float
    temperature_max_c: float
    allowed_excursion_seconds: int = Field(ge=0)

class ShipmentCreate(BaseModel):
    organization_id: UUID
    external_ref: str
    product_policy_id: UUID
    origin_label: str
    destination_label: str

class SensorCreate(BaseModel):
    organization_id: UUID
    serial_number: str
    sensor_type: str = "temperature_humidity"

class CheckpointCreate(BaseModel):
    organization_id: UUID
    sequence: int = Field(ge=1)
    label: str

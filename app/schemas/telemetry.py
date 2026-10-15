from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

class TelemetryItem(BaseModel):
    organization_id: UUID
    shipment_id: UUID
    sensor_id: UUID
    device_event_id: str = Field(min_length=1, max_length=160)
    sequence_number: int | None = None
    observed_at: datetime
    temperature_c: float
    humidity_pct: float | None = None
    metadata: dict = Field(default_factory=dict)

class TelemetryBatch(BaseModel):
    events: list[TelemetryItem] = Field(min_length=1, max_length=500)

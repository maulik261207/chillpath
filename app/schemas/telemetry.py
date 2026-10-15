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
    vibration_rms_g: float | None = None
    vibration_peak_g: float | None = None
    vibration_sample_window_ms: int | None = None
    source: str = "simulation"
    metadata: dict = Field(default_factory=dict)

class TelemetryBatch(BaseModel):
    events: list[TelemetryItem] = Field(min_length=1, max_length=500)


class LiveTelemetryItem(BaseModel):
    device_id: str = "esp32-s3-temp-01"
    temperature_c: float
    temperature_f: float | None = None
    adc_mv: int | None = None
    voltage: float | None = None
    do_tripped: bool | None = False
    buzzer_active: bool | None = False
    alarm_active: bool | None = False
    battery_pct: float | None = None
    observed_at: datetime | None = None
    source: str = "pc_usb_gateway"


class SendSmsRequest(BaseModel):
    phone_number: str = "+919557066830"
    message: str



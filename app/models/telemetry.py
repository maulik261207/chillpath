import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    __table_args__ = (UniqueConstraint("organization_id", "sensor_id", "device_event_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    shipment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shipments.id"), index=True)
    sensor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sensors.id"), index=True)
    device_event_id: Mapped[str] = mapped_column(String(160))
    sequence_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    temperature_c: Mapped[float] = mapped_column()
    humidity_pct: Mapped[float | None] = mapped_column(nullable=True)
    raw_payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    payload_hash: Mapped[str] = mapped_column(String(64))


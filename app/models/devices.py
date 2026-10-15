import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IoTDevice(Base):
    __tablename__ = "iot_devices"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    hardware_uid: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    model: Mapped[str] = mapped_column(String(120), default="ESP32-S3")
    firmware_version: Mapped[str | None] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="HARDWARE_TBD")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SensorCapabilityManifest(Base):
    __tablename__ = "sensor_capability_manifests"
    __table_args__ = (UniqueConstraint("organization_id", "device_id", "sensor_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("iot_devices.id"), index=True)
    sensor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sensors.id"), index=True)
    sensor_model: Mapped[str] = mapped_column(String(120), default="UNCONFIRMED")
    capabilities_json: Mapped[list] = mapped_column(JSON, default=list)
    unit_map_json: Mapped[dict] = mapped_column(JSON, default=dict)
    sample_rate_hz: Mapped[float | None] = mapped_column(nullable=True)
    placement: Mapped[str | None] = mapped_column(String(120), nullable=True)
    interface: Mapped[str] = mapped_column(String(40), default="TBD")
    calibration_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_reference_sensor: Mapped[bool] = mapped_column(Boolean, default=False)
    operational_status: Mapped[str] = mapped_column(String(30), default="HARDWARE_TBD")


class DeviceBootSession(Base):
    __tablename__ = "device_boot_sessions"
    __table_args__ = (UniqueConstraint("device_id", "boot_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("iot_devices.id"), index=True)
    boot_id: Mapped[str] = mapped_column(String(160))
    firmware_version: Mapped[str | None] = mapped_column(String(60), nullable=True)
    clock_quality: Mapped[str] = mapped_column(String(30), default="UNKNOWN")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


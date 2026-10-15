import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductPolicy(Base):
    __tablename__ = "product_policies"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, default=1)
    temperature_min_c: Mapped[float] = mapped_column()
    temperature_max_c: Mapped[float] = mapped_column()
    allowed_excursion_seconds: Mapped[int] = mapped_column(Integer, default=0)
    policy_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (UniqueConstraint("organization_id", "external_ref"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    external_ref: Mapped[str] = mapped_column(String(120))
    product_policy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_policies.id"))
    origin_label: Mapped[str] = mapped_column(String(200))
    destination_label: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = (UniqueConstraint("organization_id", "serial_number"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    serial_number: Mapped[str] = mapped_column(String(120))
    sensor_type: Mapped[str] = mapped_column(String(50), default="temperature_humidity")
    status: Mapped[str] = mapped_column(String(30), default="active")


class SensorAssignment(Base):
    __tablename__ = "sensor_assignments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    shipment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shipments.id"))
    sensor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sensors.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RouteCheckpoint(Base):
    __tablename__ = "route_checkpoints"
    __table_args__ = (UniqueConstraint("organization_id", "shipment_id", "sequence"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    shipment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shipments.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default="planned")
    transport_mode: Mapped[str] = mapped_column(String(30), default="road")
    obstacle_score: Mapped[float] = mapped_column(default=0.0)
    straightness_score: Mapped[float] = mapped_column(default=1.0)


import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class ReplaySession(Base):
    __tablename__ = "replay_sessions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    sensor_ids: Mapped[list] = mapped_column(JSON, default=list)
    start_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    end_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    cursor_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    speed: Mapped[str] = mapped_column(String(20), default="1x")
    status: Mapped[str] = mapped_column(String(20), default="CREATED", index=True)
    processed_rows: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


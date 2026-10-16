import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class HistoricalDataset(Base):
    __tablename__ = "historical_datasets"
    __table_args__ = (UniqueConstraint("organization_id", "content_sha256"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    provenance: Mapped[str] = mapped_column(String(40), default="HISTORICAL_RESEARCH")
    source_timezone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    content_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="IMPORTED")
    quality_report: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class DatasetImportJob(Base):
    __tablename__ = "dataset_import_jobs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="RUNNING")
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0)
    invalid_rows: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class HistoricalSensor(Base):
    __tablename__ = "historical_sensors"
    __table_args__ = (UniqueConstraint("dataset_id", "sensor_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    sensor_id: Mapped[str] = mapped_column(String(80))
    source_filename: Mapped[str] = mapped_column(String(255))
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    missing_temperature: Mapped[int] = mapped_column(Integer, default=0)
    missing_humidity: Mapped[int] = mapped_column(Integer, default=0)

class HistoricalMeasurement(Base):
    __tablename__ = "historical_measurements"
    __table_args__ = (UniqueConstraint("dataset_id", "sensor_id", "source_row_number"), Index("ix_hist_measurement_sensor_time", "dataset_id", "sensor_id", "original_timestamp"))
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    import_job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dataset_import_jobs.id"), index=True)
    sensor_id: Mapped[str] = mapped_column(String(80), index=True)
    source_filename: Mapped[str] = mapped_column(String(255))
    source_row_number: Mapped[int] = mapped_column(Integer)
    original_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    normalized_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_missing: Mapped[bool] = mapped_column(Boolean, default=False)
    humidity_missing: Mapped[bool] = mapped_column(Boolean, default=False)
    provenance: Mapped[str] = mapped_column(String(40), default="HISTORICAL_RESEARCH")

class ExperimentAction(Base):
    __tablename__ = "experiment_actions"
    __table_args__ = (UniqueConstraint("dataset_id", "source_row_number"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    source_row_number: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(120))
    original_start: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    original_end: Mapped[datetime] = mapped_column(DateTime(timezone=False))

class HistoricalAnalysisRun(Base):
    __tablename__ = "historical_analysis_runs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    replay_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("replay_sessions.id"), index=True)
    engine_version: Mapped[str] = mapped_column(String(80), default="historical-analytics-v1")
    status: Mapped[str] = mapped_column(String(30), default="RUNNING")
    result_json: Mapped[dict] = mapped_column(JSON, default=dict)

class HistoricalSensorQuality(Base):
    __tablename__ = "historical_sensor_quality"
    __table_args__ = (UniqueConstraint("analysis_run_id", "sensor_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_analysis_runs.id"), index=True)
    sensor_id: Mapped[str] = mapped_column(String(80))
    valid_count: Mapped[int] = mapped_column(Integer, default=0)
    missing_count: Mapped[int] = mapped_column(Integer, default=0)
    completeness: Mapped[float] = mapped_column(Float, default=0.0)
    health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="INSUFFICIENT")

class HistoricalAnomaly(Base):
    __tablename__ = "historical_anomalies"
    __table_args__ = (UniqueConstraint("analysis_run_id", "sensor_id", "observed_at", "kind"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_analysis_runs.id"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    sensor_id: Mapped[str] = mapped_column(String(80), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    kind: Mapped[str] = mapped_column(String(50))
    evidence_state: Mapped[str] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSON, default=dict)

class HistoricalIncident(Base):
    __tablename__ = "historical_incidents"
    __table_args__ = (UniqueConstraint("analysis_run_id", "incident_key"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_analysis_runs.id"), index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_datasets.id"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    incident_key: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    evidence_state: Mapped[str] = mapped_column(String(40))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    contributing_sensors: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class HistoricalExposure(Base):
    __tablename__ = "historical_exposures"
    __table_args__ = (UniqueConstraint("analysis_run_id", "sensor_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    analysis_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_analysis_runs.id"), index=True)
    sensor_id: Mapped[str] = mapped_column(String(80))
    verified_seconds: Mapped[int] = mapped_column(Integer, default=0)
    uncertain_seconds: Mapped[int] = mapped_column(Integer, default=0)
    remaining_allowance_seconds: Mapped[int] = mapped_column(Integer, default=0)
    minimum_c: Mapped[float] = mapped_column(Float, default=2.0)
    maximum_c: Mapped[float] = mapped_column(Float, default=8.0)
    calculation_version: Mapped[str] = mapped_column(String(80), default="exposure-v1")

class MockNotification(Base):
    __tablename__ = "historical_mock_notifications"
    __table_args__ = (UniqueConstraint("incident_id", "notification_kind"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("historical_incidents.id"), index=True)
    notification_kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="SIMULATED")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


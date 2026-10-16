"""One-click local SQLite replay verification; never imports or deletes source data."""
from __future__ import annotations
import asyncio, time, sys
from datetime import timedelta
from pathlib import Path
from sqlalchemy import func, select, text
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
import app.models  # noqa
from app.models.identity import Organization
from app.models.historical import HistoricalDataset, HistoricalMeasurement, ExperimentAction, HistoricalAnalysisRun, HistoricalSensorQuality, HistoricalAnomaly, HistoricalIncident, HistoricalExposure, MockNotification
from app.models.replay import ReplaySession
from app.services.replay_worker import _run

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "replay_verification_report.txt"

async def main():
    settings = get_settings()
    if settings.database_mode.lower() != "sqlite": raise RuntimeError("Verification requires SQLite mode")
    db_path = ROOT / "chillpath.db"
    if not db_path.exists(): raise RuntimeError(f"SQLite database not found: {db_path}")
    before_size = db_path.stat().st_size
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        measurement_count = await db.scalar(select(func.count()).select_from(HistoricalMeasurement)) or 0
        action_count = await db.scalar(select(func.count()).select_from(ExperimentAction)) or 0
        if measurement_count != 1_411_515 or action_count != 127: raise RuntimeError(f"Expected 1411515/127, found {measurement_count}/{action_count}")
        org = await db.scalar(select(Organization).order_by(Organization.created_at))
        dataset = await db.scalar(select(HistoricalDataset).order_by(HistoricalDataset.created_at))
        if not org or not dataset: raise RuntimeError("No tenant or historical dataset found")
        start, end = (await db.execute(select(func.min(HistoricalMeasurement.original_timestamp), func.max(HistoricalMeasurement.original_timestamp)).where(HistoricalMeasurement.dataset_id == dataset.id))).one()
        interval_end = min(end, start + timedelta(minutes=30))
        action = await db.scalar(select(ExperimentAction).where(ExperimentAction.dataset_id == dataset.id, ExperimentAction.original_start >= start, ExperimentAction.original_start <= interval_end).order_by(ExperimentAction.original_start))
        if action: interval_end = max(interval_end, action.original_end)
        existing = await db.scalar(select(ReplaySession).where(ReplaySession.dataset_id == dataset.id, ReplaySession.organization_id == org.id, ReplaySession.start_timestamp == start, ReplaySession.end_timestamp == interval_end))
        expected = await db.scalar(select(func.count()).select_from(HistoricalMeasurement).where(HistoricalMeasurement.dataset_id == dataset.id, HistoricalMeasurement.original_timestamp >= start, HistoricalMeasurement.original_timestamp <= interval_end)) or 0
        if existing and existing.status == "COMPLETED" and existing.processed_rows == expected and expected > 0:
            replay = existing; reused = True
        else:
            replay = existing or ReplaySession(organization_id=org.id, dataset_id=dataset.id, sensor_ids=[], start_timestamp=start, end_timestamp=interval_end, cursor_timestamp=start, speed="max")
            replay.status = "RUNNING"; replay.cursor_timestamp = start; replay.processed_rows = 0
            db.add(replay); await db.commit(); await db.refresh(replay); reused = False
    started = time.perf_counter()
    print(f"Starting replay {replay.id} for {expected} eligible measurements...", flush=True)
    if not reused:
        try: await asyncio.wait_for(_run(replay.id), timeout=300)
        except asyncio.TimeoutError: raise RuntimeError("TIMED_OUT: replay worker exceeded 300 seconds")
    elapsed = time.perf_counter() - started
    async with SessionLocal() as db:
        quality = await db.scalar(select(func.count()).select_from(HistoricalSensorQuality).where(HistoricalSensorQuality.analysis_run_id.in_(select(HistoricalAnalysisRun.id).where(HistoricalAnalysisRun.replay_id == replay.id)))) or 0
        anomalies = await db.scalar(select(func.count()).select_from(HistoricalAnomaly).where(HistoricalAnomaly.analysis_run_id.in_(select(HistoricalAnalysisRun.id).where(HistoricalAnalysisRun.replay_id == replay.id)))) or 0
        incidents = await db.scalar(select(func.count()).select_from(HistoricalIncident).where(HistoricalIncident.analysis_run_id.in_(select(HistoricalAnalysisRun.id).where(HistoricalAnalysisRun.replay_id == replay.id)))) or 0
        exposure = await db.scalar(select(func.count()).select_from(HistoricalExposure).where(HistoricalExposure.analysis_run_id.in_(select(HistoricalAnalysisRun.id).where(HistoricalAnalysisRun.replay_id == replay.id)))) or 0
        notifications = await db.scalar(select(func.count()).select_from(MockNotification).where(MockNotification.incident_id.in_(select(HistoricalIncident.id).where(HistoricalIncident.analysis_run_id.in_(select(HistoricalAnalysisRun.id).where(HistoricalAnalysisRun.replay_id == replay.id)))))) or 0
        row_count_after = await db.scalar(select(func.count()).select_from(HistoricalMeasurement)) or 0
        replay = await db.get(ReplaySession, replay.id)
        if replay is None: raise RuntimeError("Replay session disappeared")
    after_size = db_path.stat().st_size
    passed = replay.status == "COMPLETED" and replay.processed_rows == expected and expected > 0 and quality > 0 and exposure > 0 and row_count_after == 1_411_515
    result = "PASS" if passed else "FAIL"
    report = f"ChillPath replay verification\nDatabase: {db_path}\nSource measurements: {row_count_after} (expected 1411515)\nSource actions: {action_count} (expected 127)\nReplay ID: {replay.id}\nInterval: {replay.start_timestamp} -> {replay.end_timestamp}\nExpected interval rows: {expected}\nStatus: {replay.status}\nWorker error: {replay.error_message or 'none'}\nProcessed rows: {replay.processed_rows}\nDuration seconds: {elapsed:.2f}\nSensor quality rows: {quality}\nAnomalies: {anomalies}\nIncidents: {incidents}\nExposure rows: {exposure}\nMock notifications: {notifications}\nDatabase size before/after: {before_size} / {after_size} bytes\nDemo policy: 2-8 C; physical plausibility -10 to 50 C; source is historical research, not a shipment.\nResult: {result}\n"
    REPORT.write_text(report, encoding="utf-8"); print(report); print(f"Report saved to {REPORT}")
    if not passed: raise RuntimeError("Replay verification failed; see replay_verification_report.txt")

if __name__ == "__main__":
    try: asyncio.run(main())
    except Exception as exc: print(f"FAIL: {exc}"); sys.exit(1)
    finally: input("Press Enter to close...")

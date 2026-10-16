"""Single-process, bounded historical replay worker for SQLite/local deployments."""
import asyncio
from datetime import datetime
from uuid import UUID
from sqlalchemy import select, func
from app.db.session import SessionLocal
from app.models.historical import HistoricalMeasurement, HistoricalAnalysisRun, HistoricalSensorQuality, HistoricalAnomaly, HistoricalExposure, HistoricalIncident, MockNotification
from app.models.replay import ReplaySession

_tasks: dict[UUID, asyncio.Task] = {}
BATCH_SIZE = 500

async def _finalize_analysis(db, session):
    run = HistoricalAnalysisRun(dataset_id=session.dataset_id, replay_id=session.id, status="RUNNING")
    db.add(run); await db.flush()
    sensors = session.sensor_ids or [r[0] for r in (await db.execute(select(HistoricalMeasurement.sensor_id).where(HistoricalMeasurement.dataset_id == session.dataset_id).distinct())).all()]
    for sensor_id in sensors:
        total = await db.scalar(select(func.count()).select_from(HistoricalMeasurement).where(HistoricalMeasurement.dataset_id == session.dataset_id, HistoricalMeasurement.sensor_id == sensor_id)) or 0
        valid = await db.scalar(select(func.count()).select_from(HistoricalMeasurement).where(HistoricalMeasurement.dataset_id == session.dataset_id, HistoricalMeasurement.sensor_id == sensor_id, HistoricalMeasurement.temperature_c.is_not(None))) or 0
        missing = total - valid
        score = round(valid / total * 100, 2) if total else None
        db.add(HistoricalSensorQuality(analysis_run_id=run.id, sensor_id=sensor_id, valid_count=valid, missing_count=missing, completeness=(valid / total if total else 0), health_score=score, status="TRUSTED" if score is not None and score >= 80 else "INSUFFICIENT"))
        verified = uncertain = 0
        previous = None
        result = await db.stream_scalars(select(HistoricalMeasurement).where(HistoricalMeasurement.dataset_id == session.dataset_id, HistoricalMeasurement.sensor_id == sensor_id).order_by(HistoricalMeasurement.original_timestamp))
        async for point in result:
            if previous is not None:
                seconds = max(0, min(900, int((point.original_timestamp - previous.original_timestamp).total_seconds())))
                outside = previous.temperature_c is not None and (previous.temperature_c < 2 or previous.temperature_c > 8)
                if outside:
                    if point.temperature_c is None: uncertain += seconds
                    elif previous.temperature_c is not None: verified += seconds
            if point.temperature_c is not None and (point.temperature_c < -10 or point.temperature_c > 50):
                anomaly = HistoricalAnomaly(analysis_run_id=run.id, dataset_id=session.dataset_id, sensor_id=sensor_id, observed_at=point.original_timestamp, kind="PHYSICAL_RANGE", evidence_state="suspected_sensor_fault", details={"temperature_c": point.temperature_c, "version": "historical-analytics-v1"})
                db.add(anomaly)
                await db.flush()
                incident = HistoricalIncident(analysis_run_id=run.id, dataset_id=session.dataset_id, organization_id=session.organization_id, incident_key=f"{sensor_id}:{point.original_timestamp.isoformat()}:PHYSICAL_RANGE", evidence_state="suspected_sensor_fault", started_at=point.original_timestamp, contributing_sensors=[sensor_id], explanation="Recorded temperature is outside the configured physical plausibility range.")
                db.add(incident); await db.flush()
                db.add(MockNotification(incident_id=incident.id, notification_kind="historical-replay-alert", message=f"Mock alert: {sensor_id} requires review at {point.original_timestamp.isoformat()}"))
            previous = point
        db.add(HistoricalExposure(analysis_run_id=run.id, sensor_id=sensor_id, verified_seconds=verified, uncertain_seconds=uncertain, remaining_allowance_seconds=0))
    run.status = "COMPLETED"; run.result_json = {"vibration": "NOT_AVAILABLE", "notifications": "MOCK_ONLY"}
    await db.flush()

async def _run(replay_id: UUID):
    try:
        while True:
            async with SessionLocal() as db:
                session = await db.get(ReplaySession, replay_id)
                if session is None or session.status in {"STOPPED", "FAILED", "COMPLETED"}:
                    return
                if session.status == "PAUSED":
                    await asyncio.sleep(0.5); continue
                q = select(HistoricalMeasurement).where(
                    HistoricalMeasurement.dataset_id == session.dataset_id,
                    HistoricalMeasurement.original_timestamp >= session.cursor_timestamp,
                    HistoricalMeasurement.original_timestamp <= session.end_timestamp,
                )
                if session.sensor_ids: q = q.where(HistoricalMeasurement.sensor_id.in_(session.sensor_ids))
                rows = (await db.scalars(q.order_by(HistoricalMeasurement.original_timestamp, HistoricalMeasurement.sensor_id).limit(BATCH_SIZE))).all()
                if not rows:
                    await _finalize_analysis(db, session)
                    session.status = "COMPLETED"; await db.commit(); return
                last = rows[-1].original_timestamp
                session.cursor_timestamp = last
                session.processed_rows += len(rows)
                await db.commit()
            # max is intentionally cooperative; accelerated modes yield without sleeping.
            if session.speed == "1x": await asyncio.sleep(0.05)
            else: await asyncio.sleep(0)
    except asyncio.CancelledError:
        return
    except Exception as exc:
        async with SessionLocal() as db:
            session = await db.get(ReplaySession, replay_id)
            if session:
                session.status, session.error_message = "FAILED", str(exc)[:500]
                await db.commit()

def start_worker(replay_id: UUID):
    task = _tasks.get(replay_id)
    if task and not task.done(): return
    _tasks[replay_id] = asyncio.create_task(_run(replay_id))

def stop_worker(replay_id: UUID):
    task = _tasks.pop(replay_id, None)
    if task and not task.done(): task.cancel()

async def shutdown_workers():
    for replay_id in list(_tasks): stop_worker(replay_id)

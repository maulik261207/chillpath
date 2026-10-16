from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import asyncio, json
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from app.db.session import SessionLocal
from app.models.historical import HistoricalDataset, HistoricalMeasurement, ExperimentAction, HistoricalAnalysisRun, HistoricalIncident, HistoricalExposure, MockNotification
from app.models.replay import ReplaySession
from app.services.replay_worker import start_worker, stop_worker

router = APIRouter(prefix="/replays", tags=["historical replay"])
SPEEDS = {"1x", "10x", "60x", "300x", "max"}

class ReplayCreate(BaseModel):
    organization_id: UUID
    dataset_id: UUID
    sensor_ids: list[str] = Field(default_factory=list)
    speed: str = "1x"

async def get_session(replay_id: UUID, organization_id: UUID):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        return row

@router.post("")
async def create_replay(payload: ReplayCreate):
    if payload.speed not in SPEEDS: raise HTTPException(422, "speed must be 1x, 10x, 60x, 300x, or max")
    async with SessionLocal() as db:
        dataset = await db.scalar(select(HistoricalDataset).where(HistoricalDataset.id == payload.dataset_id, HistoricalDataset.organization_id == payload.organization_id))
        if dataset is None: raise HTTPException(404, "dataset not found for organization")
        q = select(func.min(HistoricalMeasurement.original_timestamp), func.max(HistoricalMeasurement.original_timestamp)).where(HistoricalMeasurement.dataset_id == dataset.id)
        start, end = (await db.execute(q)).one()
        if start is None: raise HTTPException(422, "dataset has no measurements")
        row = ReplaySession(organization_id=payload.organization_id, dataset_id=dataset.id, sensor_ids=payload.sensor_ids, start_timestamp=start, end_timestamp=end, cursor_timestamp=start, speed=payload.speed)
        db.add(row); await db.commit(); await db.refresh(row)
        return replay_view(row)

def replay_view(row):
    span = max(1.0, (row.end_timestamp - row.start_timestamp).total_seconds())
    progress = min(100.0, max(0.0, (row.cursor_timestamp - row.start_timestamp).total_seconds() / span * 100))
    return {"id": str(row.id), "organization_id": str(row.organization_id), "dataset_id": str(row.dataset_id), "sensor_ids": row.sensor_ids, "speed": row.speed, "status": row.status, "cursor_timestamp": row.cursor_timestamp.isoformat(), "start_timestamp": row.start_timestamp.isoformat(), "end_timestamp": row.end_timestamp.isoformat(), "processed_rows": row.processed_rows, "progress_pct": round(progress, 3), "vibration": "NOT_AVAILABLE", "notifications": "MOCK_ONLY"}

async def set_status(replay_id: UUID, organization_id: UUID, status: str):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        row.status = status; await db.commit(); await db.refresh(row); return replay_view(row)

@router.get("")
async def list_replays(organization_id: UUID, limit: int = Query(50, ge=1, le=100)):
    async with SessionLocal() as db:
        rows = (await db.scalars(select(ReplaySession).where(ReplaySession.organization_id == organization_id).order_by(ReplaySession.created_at.desc()).limit(limit))).all()
        return {"items": [replay_view(row) for row in rows]}

@router.get("/{replay_id}")
async def get_replay(replay_id: UUID, organization_id: UUID): return replay_view(await get_session(replay_id, organization_id))

@router.post("/{replay_id}/start")
async def start(replay_id: UUID, organization_id: UUID):
    result = await set_status(replay_id, organization_id, "RUNNING"); start_worker(replay_id); return result
@router.post("/{replay_id}/pause")
async def pause(replay_id: UUID, organization_id: UUID): return await set_status(replay_id, organization_id, "PAUSED")
@router.post("/{replay_id}/resume")
async def resume(replay_id: UUID, organization_id: UUID):
    result = await set_status(replay_id, organization_id, "RUNNING"); start_worker(replay_id); return result
@router.post("/{replay_id}/stop")
async def stop(replay_id: UUID, organization_id: UUID):
    result = await set_status(replay_id, organization_id, "STOPPED"); stop_worker(replay_id); return result

@router.post("/{replay_id}/restart")
async def restart(replay_id: UUID, organization_id: UUID):
    stop_worker(replay_id)
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        row.cursor_timestamp, row.processed_rows, row.status = row.start_timestamp, 0, "CREATED"; await db.commit(); await db.refresh(row); return replay_view(row)

@router.patch("/{replay_id}/speed")
async def speed(replay_id: UUID, organization_id: UUID, value: str):
    if value not in SPEEDS: raise HTTPException(422, "invalid speed")
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        row.speed = value; await db.commit(); await db.refresh(row); return replay_view(row)

@router.post("/{replay_id}/seek")
async def seek(replay_id: UUID, organization_id: UUID, timestamp: datetime):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        ts = timestamp.replace(tzinfo=None)
        if not row.start_timestamp <= ts <= row.end_timestamp: raise HTTPException(422, "timestamp outside dataset range")
        row.cursor_timestamp, row.processed_rows = ts, 0; await db.commit(); await db.refresh(row); return replay_view(row)

@router.get("/{replay_id}/telemetry")
async def telemetry(replay_id: UUID, organization_id: UUID, limit: int = Query(500, ge=1, le=5000)):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        q = select(HistoricalMeasurement).where(HistoricalMeasurement.dataset_id == row.dataset_id, HistoricalMeasurement.original_timestamp >= row.cursor_timestamp)
        if row.sensor_ids: q = q.where(HistoricalMeasurement.sensor_id.in_(row.sensor_ids))
        points = (await db.scalars(q.order_by(HistoricalMeasurement.original_timestamp, HistoricalMeasurement.sensor_id).limit(limit))).all()
        return {"replay_id": str(row.id), "source": "HISTORICAL_RESEARCH", "vibration": "NOT_AVAILABLE", "points": [{"sensor_id": p.sensor_id, "observed_at": p.original_timestamp.isoformat(), "temperature_c": p.temperature_c, "humidity_pct": p.humidity_pct, "temperature_missing": p.temperature_missing, "humidity_missing": p.humidity_missing} for p in points]}

@router.get("/{replay_id}/events")
async def events(replay_id: UUID, organization_id: UUID):
    async def stream():
        last = None
        for _ in range(120):
            async with SessionLocal() as db:
                row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
                if row is None: return
                payload = replay_view(row)
            marker = (payload["status"], payload["cursor_timestamp"], payload["processed_rows"])
            if marker != last:
                yield f"event: replay\ndata: {json.dumps(payload)}\n\n"; last = marker
            if payload["status"] in {"COMPLETED", "STOPPED", "FAILED"}: return
            await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@router.get("/{replay_id}/actions")
async def actions(replay_id: UUID, organization_id: UUID, before_minutes: int = Query(10, ge=0, le=1440), after_minutes: int = Query(30, ge=0, le=1440)):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        items = (await db.scalars(select(ExperimentAction).where(ExperimentAction.dataset_id == row.dataset_id, ExperimentAction.original_start <= row.cursor_timestamp).order_by(ExperimentAction.original_start))).all()
        return {"replay_id": str(row.id), "actions": [{"action": a.action, "start": a.original_start.isoformat(), "end": a.original_end.isoformat(), "causal_inference": False} for a in items]}

@router.get("/{replay_id}/incidents")
async def incidents(replay_id: UUID, organization_id: UUID):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        run = await db.scalar(select(HistoricalAnalysisRun).where(HistoricalAnalysisRun.replay_id == row.id).order_by(HistoricalAnalysisRun.id.desc()))
        if run is None: return {"items": []}
        data = (await db.scalars(select(HistoricalIncident).where(HistoricalIncident.analysis_run_id == run.id))).all()
        return {"items": [{"id": str(x.id), "status": x.status, "evidence_state": x.evidence_state, "started_at": x.started_at.isoformat(), "ended_at": x.ended_at.isoformat() if x.ended_at else None, "sensors": x.contributing_sensors, "explanation": x.explanation} for x in data]}

async def _change_incident(replay_id: UUID, organization_id: UUID, incident_id: UUID, status: str):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        incident = await db.scalar(select(HistoricalIncident).where(HistoricalIncident.id == incident_id, HistoricalIncident.organization_id == organization_id))
        if row is None or incident is None: raise HTTPException(404, "incident not found")
        incident.status = status; await db.commit()
        return {"id": str(incident.id), "status": status}

@router.post("/{replay_id}/incidents/{incident_id}/acknowledge")
async def acknowledge(replay_id: UUID, incident_id: UUID, organization_id: UUID): return await _change_incident(replay_id, organization_id, incident_id, "ACKNOWLEDGED")

@router.post("/{replay_id}/incidents/{incident_id}/resolve")
async def resolve(replay_id: UUID, incident_id: UUID, organization_id: UUID): return await _change_incident(replay_id, organization_id, incident_id, "RESOLVED")

@router.get("/{replay_id}/exposure")
async def exposure(replay_id: UUID, organization_id: UUID):
    async with SessionLocal() as db:
        row = await db.scalar(select(ReplaySession).where(ReplaySession.id == replay_id, ReplaySession.organization_id == organization_id))
        if row is None: raise HTTPException(404, "replay not found")
        run = await db.scalar(select(HistoricalAnalysisRun).where(HistoricalAnalysisRun.replay_id == row.id).order_by(HistoricalAnalysisRun.id.desc()))
        if run is None: return {"items": []}
        values = (await db.scalars(select(HistoricalExposure).where(HistoricalExposure.analysis_run_id == run.id))).all()
        return {"items": [{"sensor_id": x.sensor_id, "verified_seconds": x.verified_seconds, "uncertain_seconds": x.uncertain_seconds, "remaining_allowance_seconds": x.remaining_allowance_seconds, "calculation_version": x.calculation_version} for x in values]}

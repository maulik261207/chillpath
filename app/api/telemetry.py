import hashlib
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.telemetry import TelemetryEvent
from app.schemas.telemetry import TelemetryBatch, LiveTelemetryItem

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

# In-memory storage for real-time live telemetry from phone gateway
_latest_live_telemetry: dict | None = None
_live_history: list[dict] = []
MAX_HISTORY_SIZE = 200


@router.post("/batch")
async def ingest_batch(batch: TelemetryBatch, db: AsyncSession = Depends(get_db)) -> dict:
    results = []
    for item in batch.events:
        payload = item.model_dump(mode="json")
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        existing = await db.scalar(select(TelemetryEvent).where(
            TelemetryEvent.organization_id == item.organization_id,
            TelemetryEvent.sensor_id == item.sensor_id,
            TelemetryEvent.device_event_id == item.device_event_id,
        ))
        if existing:
            results.append({"device_event_id": item.device_event_id, "status": "duplicate" if existing.payload_hash == digest else "conflict"})
            continue
        event_fields = {key: value for key, value in payload.items() if key != "metadata"}
        db.add(TelemetryEvent(**event_fields, raw_payload_json=payload, payload_hash=digest))
        results.append({"device_event_id": item.device_event_id, "status": "accepted"})
    await db.commit()
    return {"results": results}


@router.post("/live")
async def ingest_live_telemetry(item: LiveTelemetryItem) -> dict:
    global _latest_live_telemetry, _live_history
    data = item.model_dump()
    if not data.get("observed_at"):
        data["observed_at"] = datetime.now(timezone.utc).isoformat()
    elif isinstance(data["observed_at"], datetime):
        data["observed_at"] = data["observed_at"].isoformat()

    if data.get("temperature_f") is None:
        data["temperature_f"] = round((data["temperature_c"] * 9.0 / 5.0) + 32.0, 1)

    data["received_at"] = datetime.now(timezone.utc).isoformat()
    _latest_live_telemetry = data
    _live_history.append(data)
    if len(_live_history) > MAX_HISTORY_SIZE:
        _live_history.pop(0)

    return {"status": "ok", "message": "Telemetry received and broadcasted", "data": data}


@router.get("/live")
async def get_latest_live_telemetry() -> dict:
    global _latest_live_telemetry
    if _latest_live_telemetry is None:
        return {
            "online": False,
            "message": "No live telemetry received yet. Connect your phone gateway to start streaming.",
            "data": None,
        }

    now = datetime.now(timezone.utc)
    try:
        rec_time = datetime.fromisoformat(_latest_live_telemetry["received_at"])
        delta_sec = round((now - rec_time).total_seconds(), 1)
    except Exception:
        delta_sec = 0.0

    is_online = delta_sec <= 10.0

    return {
        "online": is_online,
        "seconds_since_last_packet": delta_sec,
        "data": _latest_live_telemetry,
    }


@router.get("/live/history")
async def get_live_telemetry_history(limit: int = 50) -> dict:
    global _live_history
    count = min(limit, len(_live_history))
    return {
        "count": count,
        "points": _live_history[-count:],
    }


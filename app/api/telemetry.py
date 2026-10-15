import hashlib
import json
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.telemetry import TelemetryEvent
from app.schemas.telemetry import TelemetryBatch

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

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

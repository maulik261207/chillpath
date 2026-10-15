from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.operations import OperatorAction, RouteEvent
from app.models.shipping import Shipment
from app.models.telemetry import TelemetryEvent

router = APIRouter(prefix="/shipments", tags=["read-models"])

@router.get("/{shipment_id}/telemetry")
async def telemetry(shipment_id: UUID, organization_id: UUID, limit: int = Query(100, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    shipment = await db.scalar(select(Shipment).where(Shipment.id == shipment_id, Shipment.organization_id == organization_id))
    if shipment is None: raise HTTPException(404, "shipment not found in organization")
    rows = (await db.scalars(select(TelemetryEvent).where(TelemetryEvent.shipment_id == shipment_id, TelemetryEvent.organization_id == organization_id).order_by(TelemetryEvent.observed_at).limit(limit))).all()
    return {"items": rows, "limit": limit}

@router.get("/{shipment_id}/timeline")
async def timeline(shipment_id: UUID, organization_id: UUID, limit: int = Query(200, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    shipment = await db.scalar(select(Shipment).where(Shipment.id == shipment_id, Shipment.organization_id == organization_id))
    if shipment is None: raise HTTPException(404, "shipment not found in organization")
    route_events = (await db.scalars(select(RouteEvent).where(RouteEvent.shipment_id == shipment_id, RouteEvent.organization_id == organization_id).order_by(RouteEvent.occurred_at).limit(limit))).all()
    telemetry_events = (await db.scalars(select(TelemetryEvent).where(TelemetryEvent.shipment_id == shipment_id, TelemetryEvent.organization_id == organization_id).order_by(TelemetryEvent.observed_at).limit(limit))).all()
    operator_actions = (await db.scalars(select(OperatorAction).where(OperatorAction.shipment_id == shipment_id, OperatorAction.organization_id == organization_id).order_by(OperatorAction.recorded_at).limit(limit))).all()
    items = [
        {"id": str(event.id), "type": "route_event", "event_type": event.event_type, "occurred_at": event.occurred_at.isoformat(), "recorded_at": event.recorded_at.isoformat(), "details": event.details_json}
        for event in route_events
    ]
    items.extend(
        {"id": str(event.id), "type": "telemetry", "event_type": "measurement", "occurred_at": event.observed_at.isoformat(), "recorded_at": event.received_at.isoformat(), "details": {"sensor_id": str(event.sensor_id), "device_event_id": event.device_event_id, "temperature_c": event.temperature_c, "humidity_pct": event.humidity_pct}}
        for event in telemetry_events
    )
    items.extend(
        {"id": str(action.id), "type": "operator_action", "event_type": action.action_type, "occurred_at": action.recorded_at.isoformat(), "recorded_at": action.recorded_at.isoformat(), "details": {"decision": action.decision, "reason": action.reason}}
        for action in operator_actions
    )
    def chronological_key(item):
        value = datetime.fromisoformat(item["occurred_at"])
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    items.sort(key=chronological_key)
    return {"items": items[-limit:], "limit": limit}

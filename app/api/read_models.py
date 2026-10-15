from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.operations import RouteEvent
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
    events = (await db.scalars(select(RouteEvent).where(RouteEvent.shipment_id == shipment_id, RouteEvent.organization_id == organization_id).order_by(RouteEvent.occurred_at).limit(limit))).all()
    return {"items": [{"type": "route_event", "event_type": event.event_type, "occurred_at": event.occurred_at, "details": event.details_json} for event in events], "limit": limit}

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.operations import OperatorAction, RouteEvent
from app.models.shipping import Shipment
from app.schemas.operations import OperatorActionCreate, RouteEventCreate

router = APIRouter(prefix="/shipments", tags=["operations"])

@router.post("/{shipment_id}/route-events")
async def add_route_event(shipment_id: UUID, p: RouteEventCreate, db: AsyncSession = Depends(get_db)):
    shipment = await db.scalar(select(Shipment).where(Shipment.id == shipment_id, Shipment.organization_id == p.organization_id))
    if shipment is None: raise HTTPException(404, "shipment not found in organization")
    existing = await db.scalar(select(RouteEvent).where(RouteEvent.organization_id == p.organization_id, RouteEvent.source == p.source, RouteEvent.idempotency_key == p.idempotency_key))
    if existing: return {"status": "duplicate", "id": existing.id}
    row = RouteEvent(organization_id=p.organization_id, shipment_id=shipment_id, event_type=p.event_type, occurred_at=p.occurred_at, source=p.source, idempotency_key=p.idempotency_key, details_json=p.details)
    db.add(row); await db.commit(); await db.refresh(row); return {"status": "accepted", "id": row.id}

@router.post("/{shipment_id}/operator-actions")
async def record_action(shipment_id: UUID, p: OperatorActionCreate, db: AsyncSession = Depends(get_db)):
    shipment = await db.scalar(select(Shipment).where(Shipment.id == shipment_id, Shipment.organization_id == p.organization_id))
    if shipment is None: raise HTTPException(404, "shipment not found in organization")
    row = OperatorAction(shipment_id=shipment_id, **p.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row

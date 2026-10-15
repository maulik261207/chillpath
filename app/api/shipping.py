from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.shipping import ProductPolicy, Shipment, Sensor, RouteCheckpoint
from app.schemas.shipping import PolicyCreate, ShipmentCreate, SensorCreate, CheckpointCreate

router = APIRouter(tags=["shipping"])

@router.get("/product-policies")
async def list_policies(organization_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(ProductPolicy).where(ProductPolicy.organization_id == organization_id).order_by(ProductPolicy.created_at.desc()))
    return result.all()

@router.get("/shipments")
async def list_shipments(organization_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(Shipment).where(Shipment.organization_id == organization_id).order_by(Shipment.created_at.desc()))
    return result.all()

@router.post("/product-policies", status_code=status.HTTP_201_CREATED)
async def create_policy(p: PolicyCreate, db: AsyncSession = Depends(get_db)):
    if p.temperature_min_c >= p.temperature_max_c: raise HTTPException(422, "minimum must be below maximum")
    row = ProductPolicy(**p.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row

@router.post("/shipments", status_code=status.HTTP_201_CREATED)
async def create_shipment(p: ShipmentCreate, db: AsyncSession = Depends(get_db)):
    policy = await db.scalar(select(ProductPolicy).where(ProductPolicy.id == p.product_policy_id, ProductPolicy.organization_id == p.organization_id))
    if policy is None: raise HTTPException(404, "product policy not found in organization")
    row = Shipment(**p.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row

@router.post("/sensors", status_code=status.HTTP_201_CREATED)
async def create_sensor(p: SensorCreate, db: AsyncSession = Depends(get_db)):
    row = Sensor(**p.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row

@router.post("/shipments/{shipment_id}/checkpoints", status_code=status.HTTP_201_CREATED)
async def create_checkpoint(shipment_id: UUID, p: CheckpointCreate, db: AsyncSession = Depends(get_db)):
    shipment = await db.scalar(select(Shipment).where(Shipment.id == shipment_id, Shipment.organization_id == p.organization_id))
    if shipment is None: raise HTTPException(404, "shipment not found in organization")
    row = RouteCheckpoint(shipment_id=shipment_id, **p.model_dump()); db.add(row); await db.commit(); await db.refresh(row); return row

from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.billing import UsageLedger

router = APIRouter(prefix="/billing", tags=["billing"])

@router.get("/plans")
async def plans() -> dict:
    return {"mock": True, "plans": [
        {"code": "user", "price_minor": 1000000, "billing_period": "one_time", "currency": "INR"},
        {"code": "industry_collaboration", "price_minor": 10000000, "billing_period": "collaboration", "currency": "INR"},
        {"code": "subscription", "price_minor": 500000, "billing_period": "month", "minimum_months": 10, "minimum_commitment_minor": 5000000, "currency": "INR"},
    ]}

@router.post("/usage")
async def record_usage(organization_id: UUID, usage_type: str, dedupe_key: str, quantity: int = 1, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(UsageLedger).where(UsageLedger.organization_id == organization_id, UsageLedger.usage_type == usage_type, UsageLedger.dedupe_key == dedupe_key))
    if existing: return {"status": "duplicate", "id": existing.id}
    row = UsageLedger(organization_id=organization_id, usage_type=usage_type, dedupe_key=dedupe_key, quantity=quantity)
    db.add(row); await db.commit(); await db.refresh(row); return {"status": "recorded", "id": row.id, "mock": True}

@router.get("/usage")
async def usage(organization_id: UUID, limit: int = 100, db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(UsageLedger).where(UsageLedger.organization_id == organization_id).order_by(UsageLedger.measured_at.desc()).limit(min(limit, 500)))).all()
    return {"mock": True, "items": rows}

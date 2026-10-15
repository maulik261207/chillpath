from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.billing import UsageLedger

router = APIRouter(prefix="/billing", tags=["billing"])

@router.post("/usage")
async def record_usage(organization_id: UUID, usage_type: str, dedupe_key: str, quantity: int = 1, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(UsageLedger).where(UsageLedger.organization_id == organization_id, UsageLedger.usage_type == usage_type, UsageLedger.dedupe_key == dedupe_key))
    if existing: return {"status": "duplicate", "id": existing.id}
    row = UsageLedger(organization_id=organization_id, usage_type=usage_type, dedupe_key=dedupe_key, quantity=quantity)
    db.add(row); await db.commit(); await db.refresh(row); return {"status": "recorded", "id": row.id, "mock": True}

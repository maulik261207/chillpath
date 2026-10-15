from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.shipping import ProductPolicy, Shipment
from app.models.telemetry import TelemetryEvent
from app.services.classification import EvidenceState, classify
from app.services.exposure import Sample, calculate_exposure
from app.services.recovery import rank_recommendations

router = APIRouter(prefix="/shipments", tags=["recovery"])


@router.get("/{shipment_id}/recovery")
async def evaluate_recovery(
    shipment_id: UUID,
    organization_id: UUID,
    added_delay_seconds: int = Query(default=0, ge=0, le=7 * 24 * 60 * 60),
    alternate_available: bool = False,
    db: AsyncSession = Depends(get_db),
):
    shipment = await db.scalar(
        select(Shipment).where(Shipment.id == shipment_id, Shipment.organization_id == organization_id)
    )
    if shipment is None:
        raise HTTPException(404, "shipment not found in organization")
    policy = await db.scalar(
        select(ProductPolicy).where(
            ProductPolicy.id == shipment.product_policy_id,
            ProductPolicy.organization_id == organization_id,
        )
    )
    if policy is None:
        raise HTTPException(404, "product policy not found in organization")
    telemetry = (
        await db.scalars(
            select(TelemetryEvent)
            .where(TelemetryEvent.shipment_id == shipment_id, TelemetryEvent.organization_id == organization_id)
            .order_by(TelemetryEvent.observed_at)
            .limit(500)
        )
    ).all()
    samples = [
        Sample(
            observed_at=item.observed_at,
            temperature_c=item.temperature_c,
            credible=bool(item.raw_payload_json.get("metadata", {}).get("credible", True)),
        )
        for item in telemetry
    ]
    classification = classify(samples, policy.temperature_min_c, policy.temperature_max_c)
    exposure = calculate_exposure(samples, policy.temperature_min_c, policy.temperature_max_c)
    remaining = max(0, policy.allowed_excursion_seconds - exposure.verified_exposure_seconds)
    recommendations = rank_recommendations(
        remaining,
        added_delay_seconds,
        alternate_available,
        classification.state in {EvidenceState.suspected_sensor_fault, EvidenceState.insufficient_evidence},
    )
    return {
        "shipment_id": str(shipment.id),
        "evidence_state": classification.state.value,
        "evidence_reason": classification.reason,
        "verified_exposure_seconds": exposure.verified_exposure_seconds,
        "uncertain_exposure_seconds": exposure.uncertain_exposure_seconds,
        "remaining_budget_seconds": remaining,
        "added_delay_seconds": added_delay_seconds,
        "assumptions": [
            "Exposure uses observed timestamps and a 15 minute maximum hold between readings.",
            "Alternate facility availability is only treated as verified when explicitly configured.",
            "Recommendations are decision support and require operator review.",
        ],
        "recommendations": [
            {
                "action_type": item.action_type,
                "feasibility": item.feasibility.value,
                "priority": item.score,
                "rationale": item.rationale,
                "estimated_time_seconds": added_delay_seconds or None,
                "approval_status": "pending",
            }
            for item in recommendations
        ],
    }

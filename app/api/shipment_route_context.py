"""Translate persisted shipment policy and telemetry into routing conditions."""

from datetime import timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.shipping import ProductPolicy, Shipment
from app.models.telemetry import TelemetryEvent
from app.services.classification import classify
from app.services.exposure import Sample, calculate_exposure
from app.services.route_conditions import RouteCondition

router = APIRouter(prefix="/shipments", tags=["route-intelligence"])


@router.get("/{shipment_id}/route-condition")
async def shipment_route_condition(shipment_id: UUID, organization_id: UUID,
                                   db: AsyncSession = Depends(get_db)):
    shipment = await db.scalar(select(Shipment).where(
        Shipment.id == shipment_id, Shipment.organization_id == organization_id))
    if shipment is None:
        raise HTTPException(404, "shipment not found in organization")
    policy = await db.scalar(select(ProductPolicy).where(
        ProductPolicy.id == shipment.product_policy_id,
        ProductPolicy.organization_id == organization_id))
    if policy is None:
        raise HTTPException(404, "product policy not found in organization")
    readings = list((await db.scalars(select(TelemetryEvent).where(
        TelemetryEvent.shipment_id == shipment_id,
        TelemetryEvent.organization_id == organization_id,
    ).order_by(TelemetryEvent.observed_at.desc()).limit(501))).all())
    if not readings:
        return {"shipment_id": str(shipment_id), "condition": None,
                "detail": "No telemetry is available; route condition remains unassessed."}

    history_truncated = len(readings) > 500
    readings = list(reversed(readings[:500]))
    latest = readings[-1]
    samples = [Sample(observed_at=item.observed_at, temperature_c=item.temperature_c,
                      credible=bool((item.raw_payload_json or {}).get("metadata", {}).get("credible", True)))
               for item in readings]
    evidence = classify(samples, policy.temperature_min_c, policy.temperature_max_c)
    exposure = calculate_exposure(samples, policy.temperature_min_c, policy.temperature_max_c)
    limits = policy.policy_json or {}
    observed_at = latest.observed_at
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    condition = RouteCondition(
        source="simulation" if latest.source == "simulation" else "sensor",
        observed_at=observed_at,
        temperature_c=latest.temperature_c,
        humidity_pct=latest.humidity_pct,
        vibration_rms_g=latest.vibration_rms_g,
        vibration_peak_g=latest.vibration_peak_g,
        evidence_state=evidence.state.value,
        temperature_min_c=policy.temperature_min_c,
        temperature_max_c=policy.temperature_max_c,
        humidity_min_pct=limits.get("humidity_min_pct"),
        humidity_max_pct=limits.get("humidity_max_pct"),
        vibration_rms_max_g=limits.get("vibration_rms_max_g"),
        vibration_peak_max_g=limits.get("vibration_peak_max_g"),
        remaining_exposure_seconds=(None if history_truncated else
                                    max(0, policy.allowed_excursion_seconds - exposure.verified_exposure_seconds)),
    )
    return {"shipment_id": str(shipment_id), "condition": condition,
            "detail": ("Values come from stored telemetry and policy; source is declared by the event and is not independent GPS or sensor attestation. "
                       + ("Exposure history exceeds the review window; remaining budget is unassessed." if history_truncated else ""))}

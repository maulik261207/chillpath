"""Route decision support from declared policy and available sensor evidence.

Road geometry remains a graph problem. Sensor values affect the urgency and
feasibility assessment; absent policy thresholds never become invented limits.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class RouteCondition(BaseModel):
    source: Literal["simulation", "sensor"]
    observed_at: datetime | None = None
    temperature_c: float | None = Field(default=None, allow_inf_nan=False)
    humidity_pct: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    vibration_rms_g: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    vibration_peak_g: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    evidence_state: Literal["normal", "valid_excursion", "suspected_sensor_fault", "insufficient_evidence"] = "insufficient_evidence"
    temperature_min_c: float | None = Field(default=None, allow_inf_nan=False)
    temperature_max_c: float | None = Field(default=None, allow_inf_nan=False)
    humidity_min_pct: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    humidity_max_pct: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    vibration_rms_max_g: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    vibration_peak_max_g: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    remaining_exposure_seconds: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_ranges(self):
        for low, high in ((self.temperature_min_c, self.temperature_max_c),
                          (self.humidity_min_pct, self.humidity_max_pct)):
            if low is not None and high is not None and low >= high:
                raise ValueError("minimum policy threshold must be below maximum")
        if self.source == "sensor" and (self.observed_at is None or self.observed_at.tzinfo is None):
            raise ValueError("sensor readings require a timezone-aware observed_at")
        return self


def _is_fresh(condition: RouteCondition, now: datetime) -> bool:
    if condition.source == "simulation":
        return True
    age = (now - condition.observed_at).total_seconds()  # type: ignore[union-attr]
    return -60 <= age <= 900


def choose_route_metric(requested: str, condition: RouteCondition | None,
                        *, has_traffic_penalty: bool = False,
                        now: datetime | None = None) -> tuple[str, str]:
    if requested in {"distance", "time"}:
        return requested, "Operator-selected routing objective."
    if requested != "condition_aware":
        raise ValueError("Unsupported routing objective")
    if has_traffic_penalty:
        return "time", "Simulated traffic disruption prioritizes estimated travel time."
    if condition is not None and _is_fresh(condition, now or datetime.now(timezone.utc)):
        if (condition.evidence_state == "valid_excursion" and
                condition.temperature_c is not None and condition.temperature_min_c is not None and
                condition.temperature_max_c is not None and
                not condition.temperature_min_c <= condition.temperature_c <= condition.temperature_max_c):
            return "time", "Verified temperature excursion prioritizes estimated travel time."
        if (condition.evidence_state not in {"suspected_sensor_fault", "insufficient_evidence"} and
                condition.humidity_pct is not None and condition.humidity_min_pct is not None and
                condition.humidity_max_pct is not None and
                not condition.humidity_min_pct <= condition.humidity_pct <= condition.humidity_max_pct):
            return "time", "Declared humidity excursion prioritizes estimated travel time."
    return "distance", "No confirmed temperature or humidity reason to prioritize time; shortest road distance selected."


def assess_route_conditions(condition: RouteCondition | None, duration_s: float | None,
                            *, now: datetime | None = None) -> dict:
    if condition is None:
        return {"source": "unavailable", "risk": "unknown", "signals": [],
                "unassessed": ["temperature", "humidity", "vibration", "exposure"],
                "duration_within_exposure_budget": None,
                "recommendation": "Add shipment telemetry and product policy to assess cold-chain impact."}

    signals: list[str] = []
    unassessed: list[str] = []
    risk = "normal"
    fresh = _is_fresh(condition, now or datetime.now(timezone.utc))
    uncertain = not fresh or condition.evidence_state in {"suspected_sensor_fault", "insufficient_evidence"}
    if condition.source == "sensor":
        if not fresh:
            signals.append("Sensor reading is stale or time-inconsistent; verify before acting.")
            risk = "review"

    if condition.temperature_c is None or condition.temperature_min_c is None or condition.temperature_max_c is None:
        unassessed.append("temperature")
    elif not condition.temperature_min_c <= condition.temperature_c <= condition.temperature_max_c:
        signals.append("Temperature is outside the declared product range.")
        risk = "review" if uncertain else "critical"

    if condition.humidity_pct is None or condition.humidity_min_pct is None or condition.humidity_max_pct is None:
        unassessed.append("humidity")
    elif not condition.humidity_min_pct <= condition.humidity_pct <= condition.humidity_max_pct:
        signals.append("Humidity is outside the declared product range.")
        if risk == "normal": risk = "review" if uncertain else "at_risk"

    vibration_evaluated = False
    for reading, maximum, name in ((condition.vibration_rms_g, condition.vibration_rms_max_g, "RMS"),
                                   (condition.vibration_peak_g, condition.vibration_peak_max_g, "peak")):
        if reading is not None and maximum is not None:
            vibration_evaluated = True
            if reading > maximum:
                signals.append(f"Vibration {name} exceeds the declared handling threshold.")
                if risk == "normal": risk = "review" if uncertain else "at_risk"
    if not vibration_evaluated:
        unassessed.append("vibration")

    within_budget = None
    excursion_active = (fresh and condition.evidence_state == "valid_excursion" and
                        condition.temperature_c is not None and
                        condition.temperature_min_c is not None and
                        condition.temperature_max_c is not None and
                        not condition.temperature_min_c <= condition.temperature_c <= condition.temperature_max_c)
    if excursion_active and (condition.remaining_exposure_seconds is None or duration_s is None):
        unassessed.append("exposure")
    elif excursion_active:
        within_budget = duration_s <= condition.remaining_exposure_seconds
        if not within_budget:
            signals.append("Estimated travel time exceeds the remaining declared exposure budget.")
            if risk == "normal": risk = "at_risk"

    if condition.evidence_state == "suspected_sensor_fault":
        signals.append("Sensor evidence is conflicting; verify the reading.")
        if risk == "normal": risk = "review"
    elif condition.evidence_state == "insufficient_evidence":
        signals.append("Sensor evidence is insufficient for a confident condition decision.")
        if risk == "normal": risk = "review"

    recommendation = (
        "Escalate for operator review of the route and refrigeration; verify product viability separately."
        if risk == "critical" else
        "Check the flagged signals and confirm receiving or cooling capacity before changing destination."
        if risk in {"at_risk", "review"} else
        "Continue monitored delivery using the current route and product policy."
    )
    return {"source": condition.source, "risk": risk, "signals": signals,
            "unassessed": unassessed, "duration_within_exposure_budget": within_budget,
            "recommendation": recommendation}

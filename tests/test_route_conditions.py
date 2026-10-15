from datetime import datetime, timezone, timedelta

import pytest
from pydantic import ValidationError

from app.services.route_conditions import RouteCondition, assess_route_conditions, choose_route_metric


def test_temperature_excursion_and_budget_affect_route_assessment():
    condition = RouteCondition(source="simulation", temperature_c=9.1,
                               temperature_min_c=2, temperature_max_c=8,
                               evidence_state="valid_excursion", remaining_exposure_seconds=180)
    result = assess_route_conditions(condition, 300)
    assert result["risk"] == "critical"
    assert result["duration_within_exposure_budget"] is False
    assert "humidity" in result["unassessed"]
    assert "vibration" in result["unassessed"]


def test_humidity_and_vibration_require_declared_limits():
    condition = RouteCondition(source="simulation", temperature_c=4,
                               temperature_min_c=2, temperature_max_c=8,
                               humidity_pct=80, humidity_min_pct=30, humidity_max_pct=65,
                               vibration_rms_g=0.9, vibration_rms_max_g=0.5,
                               evidence_state="normal")
    result = assess_route_conditions(condition, 120)
    assert result["risk"] == "at_risk"
    assert len(result["signals"]) == 2
    assert "humidity" not in result["unassessed"]
    assert "vibration" not in result["unassessed"]


def test_conflicting_or_stale_real_sensor_is_review_not_confirmed_excursion():
    now = datetime.now(timezone.utc)
    condition = RouteCondition(source="sensor", observed_at=now - timedelta(minutes=20),
                               temperature_c=9, temperature_min_c=2, temperature_max_c=8,
                               evidence_state="suspected_sensor_fault")
    result = assess_route_conditions(condition, 120, now=now)
    assert result["risk"] == "review"
    assert any("stale" in signal for signal in result["signals"])
    verified_when_recorded = condition.model_copy(update={"evidence_state": "valid_excursion"})
    stale_result = assess_route_conditions(verified_when_recorded, 120, now=now)
    assert stale_result["risk"] == "review"
    assert stale_result["duration_within_exposure_budget"] is None
    assert choose_route_metric("condition_aware", verified_when_recorded, now=now)[0] == "distance"
    with pytest.raises(ValidationError):
        RouteCondition(source="sensor", temperature_c=4)


def test_condition_aware_routing_only_promotes_verified_excursion_or_traffic():
    excursion = RouteCondition(source="simulation", temperature_c=9,
                               temperature_min_c=2, temperature_max_c=8,
                               evidence_state="valid_excursion")
    uncertain = excursion.model_copy(update={"evidence_state": "suspected_sensor_fault"})
    assert choose_route_metric("condition_aware", excursion)[0] == "time"
    assert choose_route_metric("condition_aware", uncertain)[0] == "distance"
    assert choose_route_metric("condition_aware", None, has_traffic_penalty=True)[0] == "time"
    assert choose_route_metric("distance", excursion)[0] == "distance"
    humidity_excursion = RouteCondition(source="simulation", humidity_pct=75,
                                        humidity_min_pct=30, humidity_max_pct=65,
                                        evidence_state="normal")
    assert choose_route_metric("condition_aware", humidity_excursion)[0] == "time"
    vibration_only = RouteCondition(source="simulation", vibration_rms_g=0.9,
                                    vibration_rms_max_g=0.5, evidence_state="normal")
    assert choose_route_metric("condition_aware", vibration_only)[0] == "distance"

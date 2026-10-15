import math
import pytest
from app.services.sensor_trust import AlertState, EvidenceStatus, assess_sensor_health, assess_vibration, fuse_temperature, transition_alert


def test_sensor_health_and_conditional_vibration():
    assert assess_sensor_health([5.0] * 7, 7).status == EvidenceStatus.TRUSTED
    assert assess_sensor_health([math.nan], 1).status == EvidenceStatus.INVALID
    assert assess_vibration([], False).status == "NOT_APPLICABLE"


def test_fusion_keeps_environment_and_evidence_separate():
    result = fuse_temperature(12.0, 2.0, 8.0, EvidenceStatus.SUSPECT)
    assert result.environment_status == "OUT_OF_RANGE"
    assert result.evidence_status == "SUSPECT"


def test_alert_lifecycle_rejects_invalid_transition():
    assert transition_alert(AlertState.DETECTED, AlertState.PENDING_VALIDATION) == AlertState.PENDING_VALIDATION
    with pytest.raises(ValueError):
        transition_alert(AlertState.DETECTED, AlertState.RESOLVED)


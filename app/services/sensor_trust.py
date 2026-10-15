import math
from dataclasses import dataclass
from enum import StrEnum
from statistics import median


class EvidenceStatus(StrEnum):
    TRUSTED = "TRUSTED"
    SUSPECT = "SUSPECT"
    INSUFFICIENT = "INSUFFICIENT"
    INVALID = "INVALID"


class EnvironmentStatus(StrEnum):
    NORMAL = "NORMAL"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    UNKNOWN = "UNKNOWN"
    NOT_APPLICABLE = "NOT_APPLICABLE"


@dataclass(frozen=True)
class HealthAssessment:
    status: EvidenceStatus
    health_score: float | None
    coverage: float
    reason_codes: tuple[str, ...]
    algorithm_version: str = "sensor-health-v1"


def assess_sensor_health(values: list[float], expected_samples: int, absolute_jump_floor: float = 2.0, z_limit: float = 4.5) -> HealthAssessment:
    if any(not math.isfinite(value) for value in values):
        return HealthAssessment(EvidenceStatus.INVALID, None, 0.0, ("NONFINITE_VALUE",))
    coverage = min(1.0, len(values) / max(1, expected_samples))
    if not values or coverage < 0.6:
        return HealthAssessment(EvidenceStatus.INSUFFICIENT, None, coverage, ("INSUFFICIENT_COVERAGE",))
    reasons: list[str] = []
    penalty = 1.0 - coverage
    if len(values) >= 7:
        baseline = values[:-1]
        center = median(baseline)
        mad = median(abs(value - center) for value in baseline)
        robust_sigma = max(1.4826 * mad, 0.1)
        deviation = abs(values[-1] - center)
        if deviation > absolute_jump_floor and deviation / robust_sigma > z_limit:
            reasons.append("TEMPORAL_OUTLIER")
            penalty += 0.25
    score = max(0.0, min(100.0, 100.0 * (1.0 - penalty)))
    return HealthAssessment(EvidenceStatus.TRUSTED if score >= 80 else EvidenceStatus.SUSPECT, score, coverage, tuple(reasons))


@dataclass(frozen=True)
class VibrationAssessment:
    status: str
    rms_g: float | None
    peak_g: float | None
    reason_codes: tuple[str, ...]
    algorithm_version: str = "vibration-v1"


def assess_vibration(dynamic_vectors: list[tuple[float, float, float]], accelerometer_supported: bool) -> VibrationAssessment:
    if not accelerometer_supported:
        return VibrationAssessment("NOT_APPLICABLE", None, None, ("ACCELEROMETER_NOT_CONFIGURED",))
    if not dynamic_vectors:
        return VibrationAssessment("INSUFFICIENT", None, None, ("NO_DYNAMIC_SAMPLES",))
    magnitudes = [math.sqrt(x*x + y*y + z*z) for x, y, z in dynamic_vectors]
    return VibrationAssessment("EVALUATED", math.sqrt(sum(v*v for v in magnitudes) / len(magnitudes)), max(magnitudes), ())


@dataclass(frozen=True)
class FusionAssessment:
    environment_status: EnvironmentStatus
    evidence_status: EvidenceStatus
    confidence_label: str
    reason_codes: tuple[str, ...]
    algorithm_version: str = "fusion-v1"


def fuse_temperature(value: float | None, minimum: float, maximum: float, evidence: EvidenceStatus) -> FusionAssessment:
    if value is None:
        return FusionAssessment(EnvironmentStatus.UNKNOWN, EvidenceStatus.INSUFFICIENT, "LOW", ("NO_RECENT_MEASUREMENT",))
    environment = EnvironmentStatus.OUT_OF_RANGE if value < minimum or value > maximum else EnvironmentStatus.NORMAL
    label = "HIGH" if evidence == EvidenceStatus.TRUSTED else "LOW"
    reasons = ("TEMP_OUT_OF_RANGE",) if environment == EnvironmentStatus.OUT_OF_RANGE else ("TEMP_IN_RANGE",)
    return FusionAssessment(environment, evidence, label, reasons)


class AlertState(StrEnum):
    DETECTED = "DETECTED"
    PENDING_VALIDATION = "PENDING_VALIDATION"
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


_TRANSITIONS = {AlertState.DETECTED: AlertState.PENDING_VALIDATION, AlertState.PENDING_VALIDATION: AlertState.OPEN, AlertState.OPEN: AlertState.ACKNOWLEDGED, AlertState.ACKNOWLEDGED: AlertState.RESOLVED, AlertState.RESOLVED: AlertState.CLOSED}


def transition_alert(current: AlertState, target: AlertState) -> AlertState:
    if _TRANSITIONS.get(current) != target:
        raise ValueError(f"invalid alert transition: {current} -> {target}")
    return target


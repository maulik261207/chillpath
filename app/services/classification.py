from dataclasses import dataclass
from enum import StrEnum

from app.services.exposure import Sample


class EvidenceState(StrEnum):
    normal = "normal"
    valid_excursion = "valid_excursion"
    suspected_sensor_fault = "suspected_sensor_fault"
    insufficient_evidence = "insufficient_evidence"


@dataclass(frozen=True)
class Classification:
    state: EvidenceState
    reason: str


def classify(
    samples: list[Sample],
    minimum_c: float,
    maximum_c: float,
    minimum_coverage_seconds: int = 60,
    maximum_sample_gap_seconds: int = 900,
) -> Classification:
    if len(samples) < 2:
        return Classification(EvidenceState.insufficient_evidence, "at least two timestamped samples are required")
    ordered = sorted(samples, key=lambda sample: sample.observed_at)
    coverage = int((ordered[-1].observed_at - ordered[0].observed_at).total_seconds())
    if coverage < minimum_coverage_seconds:
        return Classification(EvidenceState.insufficient_evidence, "coverage is shorter than the configured minimum")
    if any(
        (following.observed_at - current.observed_at).total_seconds() > maximum_sample_gap_seconds
        for current, following in zip(ordered, ordered[1:])
    ):
        return Classification(EvidenceState.insufficient_evidence, "a telemetry gap exceeds the configured evidence window")
    breaches = [sample for sample in ordered if sample.temperature_c < minimum_c or sample.temperature_c > maximum_c]
    if not breaches:
        return Classification(EvidenceState.normal, "credible readings remain within policy limits")
    for index, sample in enumerate(ordered):
        grossly_outside = sample.temperature_c < minimum_c - 3 or sample.temperature_c > maximum_c + 3
        has_in_range_neighbors = (
            index > 0
            and index < len(ordered) - 1
            and minimum_c <= ordered[index - 1].temperature_c <= maximum_c
            and minimum_c <= ordered[index + 1].temperature_c <= maximum_c
        )
        if grossly_outside and has_in_range_neighbors:
            return Classification(EvidenceState.suspected_sensor_fault, "an isolated extreme reading conflicts with adjacent in-range evidence")
    credible_breaches = [sample for sample in breaches if sample.credible]
    if credible_breaches and len(credible_breaches) == len(breaches):
        return Classification(EvidenceState.valid_excursion, "credible readings establish a threshold breach")
    return Classification(EvidenceState.suspected_sensor_fault, "threshold readings conflict with sensor evidence quality")


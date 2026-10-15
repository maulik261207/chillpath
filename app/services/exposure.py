from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Sample:
    observed_at: datetime
    temperature_c: float
    credible: bool = True


@dataclass(frozen=True)
class ExposureResult:
    verified_exposure_seconds: int
    uncertain_exposure_seconds: int
    coverage_seconds: int


def calculate_exposure(samples: list[Sample], minimum_c: float, maximum_c: float, max_hold_seconds: int = 900) -> ExposureResult:
    ordered = sorted(samples, key=lambda item: item.observed_at)
    verified = uncertain = coverage = 0
    for current, following in zip(ordered, ordered[1:]):
        seconds = max(0, int((following.observed_at - current.observed_at).total_seconds()))
        held = min(seconds, max_hold_seconds)
        coverage += held
        breach = current.temperature_c < minimum_c or current.temperature_c > maximum_c
        if current.credible and following.credible:
            verified += held if breach else 0
        else:
            uncertain += held if breach else 0
    return ExposureResult(verified, uncertain, coverage)


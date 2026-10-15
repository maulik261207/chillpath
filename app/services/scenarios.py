from dataclasses import dataclass
from enum import StrEnum


class ScenarioType(StrEnum):
    normal = "normal"
    refrigeration_failure = "refrigeration_failure"
    traffic_delay = "traffic_delay"
    destination_closure = "destination_closure"
    evidence_gap = "evidence_gap"


@dataclass(frozen=True)
class ScenarioResult:
    scenario_type: ScenarioType
    seed: int
    readings: list[float]
    route_blocked: bool
    added_delay_seconds: int
    warning: str | None = None


def run_scenario(scenario_type: ScenarioType, seed: int = 1, duration: int = 5) -> ScenarioResult:
    duration = max(1, min(duration, 1000))
    if scenario_type == ScenarioType.refrigeration_failure:
        readings = [5.0 + (i * 2.0) for i in range(duration)]
        return ScenarioResult(scenario_type, seed, readings, False, 0, "synthetic readings")
    if scenario_type == ScenarioType.traffic_delay:
        return ScenarioResult(scenario_type, seed, [5.0] * duration, False, 1800, "synthetic delay")
    if scenario_type == ScenarioType.destination_closure:
        return ScenarioResult(scenario_type, seed, [5.0] * duration, True, 0, "destination marked closed")
    if scenario_type == ScenarioType.evidence_gap:
        return ScenarioResult(scenario_type, seed, [5.0] * max(1, duration // 2), False, 0, "coverage intentionally incomplete")
    return ScenarioResult(scenario_type, seed, [5.0] * duration, False, 0)


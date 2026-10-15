from dataclasses import dataclass
from enum import StrEnum


class Feasibility(StrEnum):
    feasible = "feasible"
    unknown = "unknown"
    blocked = "blocked"


@dataclass(frozen=True)
class Recommendation:
    action_type: str
    feasibility: Feasibility
    score: float
    rationale: str


def rank_recommendations(remaining_budget_seconds: int, added_delay_seconds: int, alternate_available: bool, evidence_uncertain: bool) -> list[Recommendation]:
    items: list[Recommendation] = []
    if alternate_available:
        items.append(Recommendation("reroute_to_verified_alternate", Feasibility.feasible, 90.0, "a verified alternate is available"))
    else:
        items.append(Recommendation("reroute_to_alternate", Feasibility.unknown, 45.0, "alternate feasibility is unverified"))
    cooling = Feasibility.feasible if remaining_budget_seconds > added_delay_seconds else Feasibility.blocked
    items.append(Recommendation("restore_cooling", cooling, 85.0 if cooling == Feasibility.feasible else 20.0, "remaining declared budget compared with revised delay"))
    if evidence_uncertain:
        items.append(Recommendation("inspect_sensor_and_collect_evidence", Feasibility.feasible, 95.0, "uncertain evidence requires investigation"))
    return sorted(items, key=lambda item: (-item.score, item.action_type))


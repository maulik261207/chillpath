from dataclasses import dataclass


@dataclass(frozen=True)
class RouteOption:
    name: str
    transport_mode: str
    obstacle_score: float
    straightness_score: float
    score: float


def rank_routes(options: list[RouteOption]) -> list[RouteOption]:
    """Rank lower-obstacle, straighter routes while preserving transport mode."""
    return sorted(options, key=lambda option: (-(option.straightness_score * 0.6 + (1 - option.obstacle_score) * 0.4), option.name))


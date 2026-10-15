from app.services.routing import RouteOption, rank_routes


def test_route_ranking_prefers_straight_low_obstacle_path():
    ranked = rank_routes([
        RouteOption("scenic", "road", 0.4, 0.8, 0),
        RouteOption("direct", "rail", 0.05, 0.95, 0),
    ])
    assert ranked[0].name == "direct"


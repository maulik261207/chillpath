from app.services.scenarios import ScenarioType, run_scenario


def test_scenarios_are_seedable_and_bounded():
    first = run_scenario(ScenarioType.refrigeration_failure, seed=7, duration=3)
    second = run_scenario(ScenarioType.refrigeration_failure, seed=7, duration=3)
    assert first == second
    assert len(first.readings) == 3
    assert run_scenario(ScenarioType.destination_closure).route_blocked is True


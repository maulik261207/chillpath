from app.services.scenarios import ScenarioType, run_scenario


def test_scenarios_are_seedable_and_bounded():
    first = run_scenario(ScenarioType.refrigeration_failure, seed=7, duration=3)
    second = run_scenario(ScenarioType.refrigeration_failure, seed=7, duration=3)
    assert first == second
    assert len(first.readings) == 3
    assert run_scenario(ScenarioType.destination_closure).route_blocked is True
    assert run_scenario(ScenarioType.sensor_fault, duration=3).readings == [5.0, 12.4, 5.0]
    assert run_scenario(ScenarioType.network_disconnection).offline is True


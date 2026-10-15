from app.services.recovery import Feasibility, rank_recommendations


def test_recovery_ranking_changes_with_evidence_and_budget():
    ranked = rank_recommendations(600, 900, alternate_available=False, evidence_uncertain=True)
    assert ranked[0].action_type == "inspect_sensor_and_collect_evidence"
    assert any(item.feasibility == Feasibility.blocked for item in ranked)


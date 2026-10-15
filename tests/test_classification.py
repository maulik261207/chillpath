from datetime import datetime, timedelta, timezone
from app.services.classification import EvidenceState, classify
from app.services.exposure import Sample


def test_classification_distinguishes_states():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    normal = [Sample(start, 5), Sample(start + timedelta(minutes=2), 6)]
    valid = [Sample(start, 12), Sample(start + timedelta(minutes=2), 13)]
    suspect = [Sample(start, 12, credible=False), Sample(start + timedelta(minutes=2), 5)]
    assert classify(normal, 2, 8).state == EvidenceState.normal
    assert classify(valid, 2, 8).state == EvidenceState.valid_excursion
    assert classify(suspect, 2, 8).state == EvidenceState.suspected_sensor_fault


def test_classification_marks_long_sample_gaps_as_insufficient_evidence():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    sparse = [Sample(start, 12), Sample(start + timedelta(minutes=20), 13)]
    result = classify(sparse, 2, 8)
    assert result.state == EvidenceState.insufficient_evidence


def test_classification_treats_isolated_extreme_spike_as_sensor_fault():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    spike = [Sample(start, 5), Sample(start + timedelta(minutes=1), 12.4), Sample(start + timedelta(minutes=2), 5)]
    assert classify(spike, 2, 8).state == EvidenceState.suspected_sensor_fault


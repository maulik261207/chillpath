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


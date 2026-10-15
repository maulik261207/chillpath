from datetime import datetime, timedelta, timezone
from app.services.exposure import Sample, calculate_exposure


def test_exposure_sorts_samples_and_holds_intervals():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = calculate_exposure([
        Sample(start + timedelta(minutes=10), 5),
        Sample(start, 12),
    ], 2, 8, max_hold_seconds=900)
    assert result.verified_exposure_seconds == 600
    assert result.uncertain_exposure_seconds == 0


def test_uncertain_samples_are_separate():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = calculate_exposure([
        Sample(start, 12, credible=False),
        Sample(start + timedelta(minutes=5), 5),
    ], 2, 8)
    assert result.verified_exposure_seconds == 0
    assert result.uncertain_exposure_seconds == 300


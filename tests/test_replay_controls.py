from app.api.replays import SPEEDS, replay_view
from types import SimpleNamespace
from datetime import datetime
from uuid import uuid4

def test_supported_speeds_and_progress_are_deterministic():
    assert SPEEDS == {"1x", "10x", "60x", "300x", "max"}
    start = datetime(2024, 1, 1); end = datetime(2024, 1, 1, 1)
    row = SimpleNamespace(id=uuid4(), organization_id=uuid4(), dataset_id=uuid4(), sensor_ids=[], speed="60x", status="CREATED", cursor_timestamp=start, start_timestamp=start, end_timestamp=end, processed_rows=0)
    first, second = replay_view(row), replay_view(row)
    assert first == second and first["progress_pct"] == 0

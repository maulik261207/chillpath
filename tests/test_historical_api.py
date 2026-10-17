import asyncio
from uuid import uuid4

from sqlalchemy.dialects import sqlite

from app.api import historical


class SummarySession:
    def __init__(self):
        self.statement = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def execute(self, statement):
        self.statement = statement
        return self

    def all(self):
        return []


def test_dataset_summary_can_filter_to_selected_sensor(monkeypatch):
    session = SummarySession()
    monkeypatch.setattr(historical, "SessionLocal", lambda: session)

    async def dataset_exists(*_):
        return object()

    monkeypatch.setattr(historical, "_dataset", dataset_exists)

    result = asyncio.run(historical.dataset_summary(uuid4(), uuid4(), sensor_id="SENSOR01"))

    compiled = session.statement.compile(dialect=sqlite.dialect())
    assert "historical_measurements.sensor_id =" in str(compiled)
    assert "SENSOR01" in compiled.params.values()
    assert result["sensors"] == []

import json
import sqlite3
from pathlib import Path
from typing import Any


class EventSpool:
    """Durable gateway queue; rows are acknowledged only after server persistence."""

    def __init__(self, path: str | Path = "gateway-spool.sqlite3") -> None:
        self.path = str(path)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS pending_events (device_event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def enqueue(self, payload: dict[str, Any]) -> bool:
        event_id = str(payload["device_event_id"])
        with self._connect() as db:
            cur = db.execute("INSERT OR IGNORE INTO pending_events(device_event_id, payload) VALUES (?, ?)", (event_id, json.dumps(payload, sort_keys=True)))
            return cur.rowcount == 1

    def pending(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT payload FROM pending_events ORDER BY rowid LIMIT ?", (limit,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def acknowledge(self, device_event_ids: list[str]) -> None:
        if not device_event_ids:
            return
        with self._connect() as db:
            db.executemany("DELETE FROM pending_events WHERE device_event_id = ?", ((event_id,) for event_id in device_event_ids))

    def mark_attempt(self, device_event_ids: list[str]) -> None:
        with self._connect() as db:
            db.executemany("UPDATE pending_events SET attempts = attempts + 1 WHERE device_event_id = ?", ((event_id,) for event_id in device_event_ids))

    def depth(self) -> int:
        with self._connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0])


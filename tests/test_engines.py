import asyncio

from app.api.engines import engine_status


def test_engine_status_exposes_connected_modules() -> None:
    payload = asyncio.run(engine_status())
    assert payload["connected"] is True
    assert {item["id"] for item in payload["engines"]} >= {
        "sensor-health-v1",
        "vibration-v1",
        "fusion-v1",
        "route-resistance-v1",
    }

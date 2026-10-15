from gateway_simulator.spool import EventSpool


def test_spool_survives_reopen_and_deduplicates(tmp_path):
    path = tmp_path / "spool.db"
    first = EventSpool(path)
    event = {"device_event_id": "gw-1", "temperature_c": 4.2}
    assert first.enqueue(event) is True
    assert first.enqueue(event) is False
    reopened = EventSpool(path)
    assert reopened.depth() == 1
    assert reopened.pending() == [event]
    reopened.acknowledge(["gw-1"])
    assert reopened.depth() == 0


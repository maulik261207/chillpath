# Historical replay controls

Phase 3 currently provides persistent, tenant-scoped replay sessions and bounded
historical telemetry reads. It does not copy source measurements.

Create a session with `POST /v1/replays`:

```json
{"organization_id":"...","dataset_id":"...","sensor_ids":["SENSOR01"],"speed":"60x"}
```

Use the returned ID with `/start`, `/pause`, `/resume`, `/stop`, `/restart`,
`PATCH /speed?value=300x`, and `/seek?timestamp=2024-09-02T10:00:00`.
Read bounded source points from `GET /v1/replays/{id}/telemetry?limit=500`.

Responses label the source as `HISTORICAL_RESEARCH`, expose original timestamps,
preserve missing-value flags, and report vibration as `NOT_AVAILABLE`. Replay
notifications are mock-only by design. Background accelerated processing,
derived incidents, exposure aggregation, and dashboard streaming remain the next
increment of Phase 3.

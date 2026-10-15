# Sensor Trust v0.3 — M0 Compatibility Map

## Repository inventory

The current backend uses FastAPI, async SQLAlchemy, PostgreSQL configuration, Docker Compose,
pytest, and a SQLite gateway spool. Domain code is separated into API, schema, model, and service
modules. Alembic is scaffolded but does not yet contain executable schema revisions.

Existing sensor-related pieces:

- `Sensor` stores organization, serial number, type, and operational status.
- `SensorAssignment` links a sensor to a shipment.
- `TelemetryEvent` stores tenant, shipment, sensor, event ID, timestamps, temperature, optional
  humidity, vibration summaries, source, raw payload, and payload hash.
- `/v1/telemetry/batch` supports bounded batches and accepted/duplicate/conflict outcomes.
- The SQLite gateway spool preserves pending events across process restarts.
- Exposure, evidence classification, recovery ranking, deterministic scenarios, and route scoring
  are implemented as pure services.

## Hardware status

The ESP32-S3 is known, but both attached sensor models remain `HARDWARE_TBD`.

The following details must be supplied before firmware or wiring work:

- Manufacturer and exact model for Sensor A and Sensor B
- Physical quantity measured by each sensor
- I2C, SPI, 1-Wire, analog, or other interface
- Expected units and manufacturer range
- Sampling rate and calibration status
- Placement and mounting orientation
- ESP32-S3 board variant and GPIO connections

Until these are known, the backend must support configurable capability manifests. It must not
assume two temperature sensors, accelerometer support, or any validated vibration threshold.

## Compatibility mapping

| v0.3 requirement | Current implementation | Required change |
|---|---|---|
| Sensor capability manifest | Sensor has only type/status | Add capabilities, unit map, model, interface, placement, sampling, calibration, and `HARDWARE_TBD` state |
| Device identity and boot sessions | Not modeled | Add device, boot ID, firmware, clock quality, and device-to-sensor relationships |
| Type-specific telemetry | Flat temperature/humidity/vibration fields | Keep backward compatibility and add a versioned device-event contract with measurement maps |
| Raw immutable evidence | Raw JSON and payload hash exist | Add boot/event identity, normalized units, quality flags, and algorithm provenance |
| Sensor Health Engine | Basic evidence classifier only | Add freshness, missing fraction, Hampel, rate, stuck, physical validation, and peer checks |
| Vibration Engine | Vibration summary fields only | Add capability gating, filter metadata, RMS/peak validation, shock episodes, and `NOT_APPLICABLE` |
| Sensor Fusion Engine | No independent fusion model | Add environment/evidence states, hypotheses, reason codes, coverage, and versioning |
| Alert Lifecycle Engine | Operator actions and route events only | Add incident lifecycle, debounce, hysteresis, dedupe, acknowledgment, resolution, and notification outbox |
| SMS | No provider/outbox implementation | Add mock provider and transactional outbox before any real provider |
| Tenant enforcement | Body/query organization IDs | Replace with authenticated tenant context and role checks |
| Migrations | Scaffold only | Create additive Alembic revisions and PostgreSQL migration tests |

## Technical conflicts and gaps

1. The current telemetry endpoint accepts `organization_id`, `shipment_id`, and `sensor_id` from
   the request body. Hardware ingestion must derive tenant and assignment from authenticated device
   identity instead.
2. The login endpoint returns a temporary token without persistent validation, so protected device
   and dashboard endpoints cannot yet claim production authorization.
3. Sensor capability information is represented by a broad `sensor_type` string, which cannot
   safely decide whether peer-temperature or vibration analysis applies.
4. Vibration summary fields exist, but filter method, sample rate, sample count, gravity removal,
   and calibration are absent. Vibration alerts must remain disabled.
5. Route ranking currently accepts caller-provided obstacle and straightness scores. It does not use
   verified mapping, traffic, GPS, or obstacle data and must be labeled a planning heuristic.
6. No persistent health, fusion, incident, notification, or algorithm/config version records exist.
7. Database migrations are not executable, so model additions are not yet deployable safely.
8. Current tests are mainly unit/smoke tests and do not prove PostgreSQL tenant isolation,
   idempotent concurrent ingestion, or device authentication.

## Proposed M1 files

Subject to approval, M1 should add or update:

- `app/models/devices.py`: devices, sensor capabilities, boot sessions, assignments
- `app/models/telemetry.py`: additive provenance and normalized-measurement fields
- `app/models/assessments.py`: health and fusion assessment records
- `app/schemas/devices.py`: capability manifest and device telemetry contracts
- `app/api/devices.py`: tenant-admin manifest endpoints
- `alembic/versions/...`: additive schema migration
- `tests/test_sensor_manifest.py` and PostgreSQL migration/integration coverage

The existing simulator payload remains supported during this change.

## Review gate

M0 is complete. No v0.3 core schema migration, firmware, SMS provider, or calibrated threshold has
been implemented. Approval is required before beginning M1 data contracts and migrations.


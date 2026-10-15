# ChillPath Backend: What We Are Doing

## Purpose

ChillPath is a backend for tracking temperature-sensitive shipments. It records telemetry,
preserves evidence, identifies possible excursions or sensor faults, and helps operators compare
recovery actions. It does not declare products safe, approved, or fit for use.

## Current technology

- Python 3.12+
- FastAPI and generated OpenAPI documentation
- SQLAlchemy 2 with an async PostgreSQL connection
- Alembic migration scaffold
- PostgreSQL 16 through Docker Compose
- Pytest tests
- A local SQLite gateway spool for offline telemetry buffering

## What has been implemented

### Foundation

- Environment-based configuration
- FastAPI application and health endpoints
- Structured HTTP and validation errors
- Configurable local CORS
- Dockerfile and Docker Compose API/database services

### Identity and tenants

- Organizations
- Users and memberships
- Tenant roles such as owner, admin, dispatcher, operations manager, quality reviewer, and viewer
- Registration and credential verification endpoints
- Password hashing with per-password salts

### Shipment operations

- Versioned product policy records
- Organization-scoped shipments
- Sensor records and assignment foundations
- Route checkpoints
- Immutable route events
- Operator action records with accepted/rejected decisions and reasons

### Telemetry and evidence

- Immutable telemetry events
- Bounded telemetry batch ingestion
- Duplicate detection using organization, sensor, and device event ID
- Conflict detection when an event ID is reused with a different payload
- Durable offline gateway spool backed by SQLite
- Verified and uncertain exposure calculations
- Deterministic evidence classification:
  - normal
  - valid excursion
  - suspected sensor fault
  - insufficient evidence

### Recovery and simulations

- Ranked recovery recommendations with feasibility and rationale
- Shipment telemetry and route timeline read APIs
- Seedable demo simulations for normal operation, refrigeration failure, traffic delay, destination
  closure, and evidence gaps

### Mock billing

- Demo plan catalog
- Subscription and usage-ledger models
- Idempotent mock usage recording
- Organization usage reporting
- No real payment collection or payment credentials

## Important API groups

- `GET /health/live`
- `GET /health/ready`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/product-policies`
- `POST /v1/shipments`
- `POST /v1/sensors`
- `POST /v1/telemetry/batch`
- `GET /v1/shipments/{id}/telemetry`
- `GET /v1/shipments/{id}/timeline`
- `POST /v1/shipments/{id}/route-events`
- `POST /v1/shipments/{id}/operator-actions`
- `POST /v1/simulations`
- `GET /v1/billing/plans`
- `POST /v1/billing/usage`
- `GET /v1/billing/usage`

## Running locally

For a local Python run:

```text
python -m venv .venv
.venv\\Scripts\\python -m pip install -e .[test]
docker compose up -d db
.venv\\Scripts\\python -m uvicorn app.main:app --reload
```

For the complete container setup:

```text
docker compose up --build
```

The API documentation is available at `http://localhost:8000/docs`.

## Verification

The current test suite covers health checks, telemetry spooling, exposure calculations, evidence
classification, recovery ranking, deterministic scenarios, and structured validation errors.

Current result: **9 tests passing**.

## Remaining work

The implementation is a hackathon-ready foundation, not a finished production service. Remaining
work includes:

- Complete Alembic migrations and database integration fixtures
- Persistent sessions or JWT refresh-token rotation
- Central tenant and permission dependencies on every endpoint
- Full CRUD and pagination for all domain resources
- Audit-event persistence and support-access controls
- Persisted simulation runs and scenario lifecycle endpoints
- Complete incident, recommendation, and exposure read models
- Database readiness checks and operational observability
- Production secrets, TLS, backups, retention, and deployment hardening
- Physical sensor, routing, traffic, and payment integrations

## Repository status

The backend work is maintained on the `main` branch of the ChillPath GitHub repository. Changes are
implemented incrementally, tested before publishing, and documented in `CHANGELOG.md`.


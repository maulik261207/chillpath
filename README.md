# ChillPath

ChillPath is a cold-chain operations prototype with a React command center, deterministic shipment simulator, and FastAPI service. The default interface uses clearly labeled synthetic data and does not make product-safety, compliance, or release decisions.

## Frontend demo

Requirements: Node.js 20 or newer.

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The demo includes the landing page, operations dashboard, searchable shipment list and detail, recovery suggestions, traceability export, and a deterministic scenario lab with offline buffering and a guided walkthrough.

Build and run the frontend tests:

```sh
npm run build
npm test
```

## Backend API

Requirements: Python 3.11 or newer.

```sh
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
python -m pip install -e '.[test]'
uvicorn app.main:app --reload
```

The API defaults to a local SQLite database (`chillpath.db`) and creates the schema at startup. Open `http://localhost:8000/docs` for the API reference. PostgreSQL settings are available in `.env.example`; Docker Compose can run the API and database together with `docker compose up --build`.

Run the backend suite:

```sh
pytest
```

## Connected shipment mode

1. Start the API and register a development organization at `POST /v1/auth/register` using `/docs`.
2. Copy the returned `organization_id`.
3. Copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL=http://localhost:8000/v1` and `VITE_ORGANIZATION_ID` to that UUID.
4. Restart the Vite server. The Shipments page can list and create shipments and policies. Shipment detail and recovery are API-backed.

The API currently accepts organization IDs directly and the authentication token is a development placeholder. This is not production tenant authorization; do not expose it to untrusted users.

## Current API surface

- `GET /health/live` and database-backed `GET /health/ready`.
- `POST /v1/auth/register` and `POST /v1/auth/login` (development identity scaffold).
- `GET` and `POST /v1/product-policies`.
- `GET` and `POST /v1/shipments`; `GET /v1/shipments/{id}`.
- `POST /v1/telemetry/batch` for duplicate-safe bounded batch ingestion.
- `GET /v1/shipments/{id}/telemetry` and `/timeline`.
- `GET /v1/shipments/{id}/recovery` for evidence classification and ranked, pending recommendations.
- `POST /v1/simulations` and mock usage billing endpoints.

The service stores UTC event times and scopes records by organization ID. Synthetic demo behavior and API prototype boundaries are identified in the interface and documentation.

## ESP32-S3 and sensor trust

The backend also includes configurable sensor manifests and device boot sessions for the ESP32-S3 foundations. Unknown hardware remains marked `HARDWARE_TBD`; the prototype does not assume board model, GPIO assignment, calibration values, or vibration threshold. Sensor health, vibration, fusion, and route planning utilities are planning inputs only and do not claim live map, GPS, traffic, or obstacle verification. See [SENSOR_TRUST_M0_COMPATIBILITY.md](SENSOR_TRUST_M0_COMPATIBILITY.md) for known gaps.

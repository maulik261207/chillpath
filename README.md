# ChillPath

ChillPath is a cold-chain operations prototype with a React command center, deterministic shipment simulator, and FastAPI service. The default interface uses clearly labeled synthetic data and does not make product-safety, compliance, or release decisions.

## Frontend demo

Requirements: Node.js 20 or newer.

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The demo includes a Geoapify-backed landing-page route map, operations dashboard, connected engine control center, searchable shipment list and detail, recovery suggestions, traceability export, and a deterministic scenario lab with offline buffering and a guided walkthrough.

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
3. Copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL=http://localhost:8000` and `VITE_ORGANIZATION_ID` to that UUID.
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

## ESP32-S3 hardware and firmware

Firmware is located in [`firmware/esp32_sensors_sms/`](firmware/esp32_sensors_sms/):
- **Temperature Sensor (Red board)**: `AO` -> GPIO 4, `DO` -> GPIO 5, `+` -> 3V3, `GND` -> GND.
- **Active Buzzer (Black board)**: `S` -> GPIO 6, `middle pin` -> 3V3, `-` -> GND.
- **GSM Modem (Optional)**: `TX` -> GPIO 18, `RX` -> GPIO 17.

The backend includes configurable sensor manifests and device boot sessions for the ESP32-S3.
Unknown hardware remains marked `HARDWARE_TBD`; no model, GPIO, calibration, or vibration
threshold is assumed.

- `app/models/devices.py`: devices, manifests, and boot sessions.
- `app/api/devices.py`: device and manifest endpoints.
- `app/services/sensor_trust.py`: health, vibration, fusion, and alert lifecycle engines.
- `app/services/routing.py`: straight, low-obstacle planning across transport modes.
- `SENSOR_TRUST_M0_COMPATIBILITY.md`: compatibility review and production gaps.

Route scores are planning inputs and do not claim live map, GPS, traffic, or obstacle verification.

## Maps and rerouting

Set `GEOAPIFY_API_KEY` in the backend `.env`; never place it in a `VITE_` variable or frontend
source. The frontend can call:

- `GET /v1/maps/autocomplete?text=...` for address suggestions.
- `POST /v1/maps/route` with two or more `{latitude, longitude}` waypoints and a transport mode.
- `POST /v1/maps/reroute-options` with waypoints and multiple modes to compare alternatives.
- `GET /v1/maps/modes` to populate the complete transport-mode selector.
- `GET /v1/maps/tiles/{z}/{x}/{y}.png` to render Geoapify tiles without exposing the API key.
- `GET /v1/engines/status` for the connected engine control center.

The route endpoints return GeoJSON geometry, distance, duration, instructions, and the selected
transport mode. Reroute options are ranked by duration and then distance. This ranking does not
claim that roads are obstacle-free; verified live obstacle data would require an additional data
source.


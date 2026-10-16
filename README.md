# ChillPath

ChillPath is a cold-chain operations prototype with a React command center, deterministic shipment simulator, and FastAPI service. The default interface uses clearly labeled synthetic data and does not make product-safety, compliance, or release decisions.

## Frontend demo

Requirements: Node.js 20 or newer.

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The demo includes a Geoapify-backed Bengaluru–Mysuru landing-page route map, operations dashboard, connected engine control center, searchable shipment list and detail, recovery suggestions, traceability export, and a deterministic scenario lab with offline buffering and a guided walkthrough.

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

### Live ESP32 temperature bridge

The dashboard reads live temperature from `GET /v1/telemetry/live`. Connect the
ESP32-S3 with a USB data cable, upload the firmware, and run the bridge in a
second terminal from the repository root:

```powershell
python -m pip install -e .
python pc_sensor_bridge.py
```

The bridge prints the detected COM port and each uploaded reading. If it keeps
printing `Waiting for ESP32-S3 USB connection`, Windows has not exposed the
board as a serial device yet. Check Device Manager for the COM number, close
any Arduino or VS Code serial monitor holding that port, then pass it directly:

```powershell
python pc_sensor_bridge.py --port COM11
```

The API key must match `CHILLPATH_API_KEY` used by the backend. The local
frontend uses the same value through `VITE_LIVE_TELEMETRY_API_KEY` in
`frontend/.env.local`; restart Vite after changing it. The bridge accepts the
firmware's `temp` field (or `temperature_c`) and converts it to the API shape.

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

Set `TOMTOM_API_KEY` and `GEOAPIFY_API_KEY` in the backend `.env`; never place either key in a
`VITE_` variable or frontend source. TomTom provides traffic-aware car and truck routes, with
Geoapify as the server-side fallback. The frontend can call:

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

The landing page renders a basic truck or car route, distance, and travel-time estimate immediately.
It replaces that estimate with the traffic-aware backend route when the provider responds.

## Route Intelligence: India and Bengaluru

The landing page links to development sign-in (`/login`), registration
(`/signup`), and billing (`/billing`). The first two forms call the existing
development auth endpoints. Login currently does not establish a durable or
authorized session; the dashboard remains a demo until production identity
and tenant enforcement are implemented. Billing lists User (₹10,000), Industry
collaboration (₹1,00,000), and Subscription (₹5,000 per month, minimum ten
months/₹50,000). The billing API returns these informational plans; no payment
or subscription activation is performed.

In Bengaluru city mode, origin and destination are chosen through the existing
Geoapify address autocomplete endpoint. Selected addresses are snapped to the
cached driving graph within 350 m; addresses outside coverage are rejected.
Geoapify must be configured on the backend for address search. Geographic
coordinates are internal to route computation and are not shown in the form.

Start the API and frontend as above, then open `/route-intelligence`. Copy
`frontend/.env.example` to `frontend/.env.local` and set `VITE_MAPTILER_API_KEY`
to your MapTiler browser key. Restrict that key to the origins used for the demo.
The local env file is ignored by Git. MapTiler supplies the dark vector basemap;
the Python API does the routing. Map tiles still require internet access.

The bundled `data/bengaluru_centre.json` is a versioned, compact directed road
graph derived from an OpenStreetMap XML extract via OSMnx. Its coverage is a
small central Bengaluru area, not the full city. The preprocessing script
`scripts/prepare_bengaluru_graph.py` can refresh it from a local
`data/bengaluru_centre.osm` extract, a cached GraphML file, or OSMnx/Overpass.
GraphML/XML caches are ignored by Git. Preprocessing retains the largest weakly
connected driving component and records the count of dropped nodes. The API
never calls Overpass for a route request. Regenerating the graph changes its
version; restart the API and reload the page together.

City mode snaps selected points within 350 m of a supported driving node. It
runs a directed, instrumented Dijkstra search with distance or estimated-time
weights; the latter uses OSM speed tags when valid and 30 km/h otherwise.
The map shows the resulting route, without exposing the search animation or
algorithm internals in the interface. Cold-chain priority is the default:
fresh, credible temperature or policy-defined humidity excursions use estimated
travel time, while normal conditions use road distance. Vibration breaches are
flagged for review because this graph has no road-smoothness weights. Explicit distance and time choices remain
available. A clicked road closure excludes its directed edges from the next
search. Simulated traffic adds a fourfold penalty to selected previous route
edges. The shipment telemetry and India corridors shown on this page are
explicitly labeled demonstrations; India corridors are geographic guides, not
nationwide computed routes or live GPS. No verified cold-storage or receiving
facility is configured, so facility rerouting is deliberately unavailable.

The route API accepts a typed condition snapshot containing temperature,
humidity, vibration, evidence state, product limits, and remaining exposure
budget. The route decision reports which signals could be evaluated and which
lacked readings or policy thresholds; it never invents humidity or vibration
limits. `GET /v1/shipments/{id}/route-condition?organization_id=...` builds this
snapshot from stored telemetry and product policy. When connected shipment
mode is configured, Route Intelligence can select a stored shipment and use
its latest condition snapshot. Road endpoints remain operator selected until
verified geocoordinates and route assignments are stored for those shipments.

The route API is under `/v1/maps`: `GET /regions`,
`GET /regions/bengaluru_centre`, `GET /regions/bengaluru_centre/graph`,
`POST /dijkstra`, `POST /recalculate`, and `POST /assess-conditions`.
Paginated `GET /searches/{search_id}/events` remains available for diagnostics;
the user interface does not load it. For automated backend tests, use a fresh
SQLite database, for example
`DATABASE_URL=sqlite+aiosqlite:////private/tmp/chillpath-test.db pytest`.

## ESP32-S3 Direct PC Internet Bridge & Authenticated Telemetry API

Bluetooth has been completely replaced with a direct, ultra-stable USB Serial -> PC Internet Bridge that uploads live temperature data from the physical sensors to the Web Cloud API.

### Hardware Pin Mapping
- **Red NTC Temperature Sensor**:
  - `AO` -> GPIO 4 (ADC1 Channel 3)
  - `DO` -> GPIO 5 (LM393 Digital Comparator threshold)
  - `+` (VCC) -> 3V3
  - `GND` -> GND
- **Active Buzzer (Black Module)**:
  - `S` (Signal) -> GPIO 6
  - `Middle` (VCC) -> 3V3
  - `-` (GND) -> GND

---

### 1. Start the PC Internet Bridge
Connect the ESP32-S3 to your PC via USB and run:
```bash
python pc_sensor_bridge.py
```
*The bridge automatically detects the USB serial port (`COM11`/`CH343`), reads live JSON readings every 1s, and uploads them to the web API.*

---

### 2. Accessing the Live Data from Your Website (API Key Protected)

The API is protected with an API Key:
- **Default API Key**: `chillpath_live_secret_key` (can be configured via `CHILLPATH_API_KEY` env var)
- **Endpoint**: `http://localhost:8000/v1/telemetry/live`

#### Option A: JavaScript `fetch()` (Using HTTP Header)
```javascript
async function getLiveTemperature() {
  const response = await fetch('http://localhost:8000/v1/telemetry/live', {
    headers: {
      'X-API-Key': 'chillpath_live_secret_key'
    }
  });
  const result = await response.json();
  console.log('Temperature:', result.data.temperature_c, '°C');
  console.log('Fahrenheit:', result.data.temperature_f, '°F');
  console.log('DO Tripped:', result.data.do_tripped);
  console.log('Buzzer Active:', result.data.buzzer_active);
}
```

#### Option B: Direct URL Query Parameter
```
http://localhost:8000/v1/telemetry/live?api_key=chillpath_live_secret_key
```

#### Option C: cURL
```bash
curl -X GET "http://localhost:8000/v1/telemetry/live" -H "X-API-Key: chillpath_live_secret_key"
```

---

### 3. Interactive Web Viewer
Open `test_web_api.html` directly in your browser to view real-time live graphs, gauges, buzzer alerts, and copy-paste integration code.

# ChillPath — Project Overview

## Features
- Live map, route planning, rerouting, distance and travel-time comparison across transport modes.
- Shipment dashboard with temperature, route, sensor status, alerts and history.
- Recovery plans, operator approvals, scenario testing and offline data buffering.
- ESP32-S3 support for temperature and accelerometer data, with configurable sensor manifests.

## Unique Features
- Sensor-trust engines detect faulty readings, missing data and vibration events before raising alerts.
- Routes favor simpler, straighter and lower-resistance travel, with multimodal alternatives.
- Human-controlled recovery: ChillPath explains and ranks actions, while operators make the decision.
- Backend map proxy keeps the Geoapify API key out of the frontend.

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, React Router, Zustand, Recharts, Three.js.
- **Backend:** Python, FastAPI, SQLAlchemy, Alembic, SQLite/PostgreSQL, Pydantic, HTTPX.
- **Hardware & Maps:** ESP32-S3 sensor firmware, Geoapify routing and map tiles.
- **Testing/Deployment:** Vitest, Pytest and Docker Compose.

## USP
ChillPath combines live routing, cold-chain monitoring and sensor reliability in one system, helping teams choose a practical next step without exposing secrets or automating safety decisions.

## Implemented
Landing-page map, multimodal routing APIs, shipment and policy APIs, telemetry ingestion, sensor-trust engines, device manifests, recovery recommendations, event history, simulator, connected engine dashboard and secure environment configuration.

# ChillPath backend

The repository now includes a Vite/React command center in `frontend/`. It runs in an
explicitly labeled deterministic demo mode by default, so the product walkthrough does not
depend on a running API or a paid service. The FastAPI service remains available for connected
mode integration.

Milestone 0 provides a small FastAPI service scaffold. Product, tenant, telemetry, exposure,
recovery, and billing domains are intentionally deferred to later milestones.

The current local implementation now includes identity and tenant foundations, shipment and
sensor records, duplicate-safe telemetry ingestion, an offline gateway spool, exposure and
evidence classification, recovery recommendations, route timelines, mock usage billing, and
seedable demo simulations. These are hackathon foundations and do not make product-safety or
product-release decisions.

## Local setup

### Frontend demo

1. Install Node.js 20 or newer.
2. Run `cd frontend` and `npm install`.
3. Start the interface with `npm run dev` and open `http://localhost:5173`.
4. Run `npm run build` for the TypeScript check and production bundle.

The demo includes the landing page, fleet command center, shipment list, recovery queue,
traceability timeline, and deterministic disruption simulator. It labels its synthetic data as
demo data and makes no product safety or release decisions.

### Backend

1. Create a virtual environment and install dependencies: `python -m venv .venv` then
   `.venv\\Scripts\\python -m pip install -e .[test]`.
2. Copy `.env.example` to `.env`.
3. Start PostgreSQL with `docker compose up -d db`.
4. Run the API with `.venv\\Scripts\\python -m uvicorn app.main:app --reload`.
5. Open `http://localhost:8000/docs` for the generated OpenAPI document.

Run tests with `.venv\\Scripts\\python -m pytest`.

To run the API and PostgreSQL together in containers, use `docker compose up --build`. The API
is then available at `http://localhost:8000` and its OpenAPI UI at `http://localhost:8000/docs`.

## Current endpoints

- `GET /health/live` confirms the process is alive.
- `GET /health/ready` is a placeholder readiness endpoint; database checks arrive with the
  first schema milestone.
- `POST /v1/auth/register` creates a user, organization, and owner membership.
- `POST /v1/auth/login` verifies credentials and returns a temporary bearer token placeholder.
- `POST /v1/telemetry/batch` ingests bounded telemetry batches with duplicate/conflict results.
- `POST /v1/simulations` runs a deterministic demo scenario.
- `GET /v1/shipments/{id}/timeline` returns route-event history.
- `POST /v1/billing/usage` records mock, deduplicated usage.

The backend stores UTC timestamps and will use tenant-scoped, append-only evidence models as
the domain milestones are implemented. It does not make product-safety or product-release
decisions.


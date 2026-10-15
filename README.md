# ChillPath backend

Milestone 0 provides a small FastAPI service scaffold. Product, tenant, telemetry, exposure,
recovery, and billing domains are intentionally deferred to later milestones.

## Local setup

1. Create a virtual environment and install dependencies: `python -m venv .venv` then
   `.venv\\Scripts\\python -m pip install -e .[test]`.
2. Copy `.env.example` to `.env`.
3. Start PostgreSQL with `docker compose up -d db`.
4. Run the API with `.venv\\Scripts\\python -m uvicorn app.main:app --reload`.
5. Open `http://localhost:8000/docs` for the generated OpenAPI document.

Run tests with `.venv\\Scripts\\python -m pytest`.

## Current endpoints

- `GET /health/live` confirms the process is alive.
- `GET /health/ready` is a placeholder readiness endpoint; database checks arrive with the
  first schema milestone.
- `POST /v1/auth/register` creates a user, organization, and owner membership.
- `POST /v1/auth/login` verifies credentials and returns a temporary bearer token placeholder.

The backend stores UTC timestamps and will use tenant-scoped, append-only evidence models as
the domain milestones are implemented. It does not make product-safety or product-release
decisions.


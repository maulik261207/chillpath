"""Small read-only local database summary for hackathon setup verification."""
from fastapi import APIRouter
from sqlalchemy import text
from app.db.session import engine

router = APIRouter(prefix="/local/database", tags=["local database"])

@router.get("/summary")
async def database_summary() -> dict:
    tables = ["organizations", "shipments", "sensors", "telemetry_events", "historical_datasets", "historical_measurements", "experiment_actions"]
    result = {"database": engine.url.database, "tables": {}}
    async with engine.connect() as connection:
        for table in tables:
            try:
                result["tables"][table] = int((await connection.execute(text(f"SELECT COUNT(*) FROM {table}"))).scalar_one())
            except Exception:
                result["tables"][table] = None
    return result

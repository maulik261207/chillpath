"""Beginner-friendly, safety-first Windows launcher for the historical importer."""
from __future__ import annotations
import asyncio, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATASETS = ROOT / "datasets"
REPORT = ROOT / "import_verification_report.txt"
EXPECTED_MEASUREMENTS = 1_411_515
EXPECTED_ACTIONS = 127

def fail(message: str):
    print(f"\nERROR: {message}\n")
    input("Press Enter to close...")
    raise SystemExit(1)

def check_migrations(database_mode: str):
    if database_mode.lower() == "sqlite":
        print("SQLite mode: Alembic is not required; tables are initialized additively by FastAPI/importer.")
        return
    print("Checking Alembic migration state...")
    result = subprocess.run([sys.executable, "-m", "alembic", "current"], cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        fail("Alembic could not read the database. Confirm .env, PostgreSQL, and migrations first.\n" + result.stderr.strip())
    print(result.stdout.strip() or "No Alembic revision reported.")
    if "0002_historical_dataset" not in result.stdout:
        fail("Historical migration 0002_historical_dataset is not active. Run 'alembic upgrade head' manually after reviewing it; this tool never applies migrations automatically.")

async def run():
    # SQLite is the default hackathon mode and deliberately wins over stale .env PostgreSQL values.
    os.environ.setdefault("CHILLPATH_DB_MODE", "sqlite")
    os.environ["DATABASE_MODE"] = os.getenv("CHILLPATH_DB_MODE", "sqlite")
    try:
        from sqlalchemy import func, select, text
        from app.core.config import get_settings
        from app.db.session import SessionLocal, engine
        from app.db.base import Base
        import app.models  # noqa: F401
        from app.models.identity import Organization
        from app.models.historical import HistoricalDataset, HistoricalMeasurement, ExperimentAction
        from app.services.historical_import import import_dataset
    except Exception as exc:
        fail(f"Python dependencies are missing: {exc}\nRun: python -m pip install -e .")
    settings = get_settings()
    print(f"Database mode: {settings.database_mode.lower()}")
    if settings.database_mode.lower() != "sqlite":
        print("PostgreSQL mode was explicitly selected; DATABASE_URL will be used.")
    else:
        print(f"SQLite file: {ROOT / 'chillpath.db'}")
    archive, actions = DATASETS / "Preprocessed.zip", DATASETS / "experiment_actions.csv"
    if not archive.exists() or not actions.exists():
        fail(f"Put both files in {DATASETS}: Preprocessed.zip and experiment_actions.csv")
    print("Checking database connectivity and required tables...")
    try:
        if settings.database_mode.lower() == "sqlite":
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            table_query = ("SELECT name FROM sqlite_master WHERE type='table'"
                           if settings.database_mode.lower() == "sqlite"
                           else "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
            tables = set((await conn.execute(text(table_query))).scalars())
    except Exception as exc:
        fail(f"Could not connect using DATABASE_URL (password is not displayed): {exc}")
    required = {"historical_datasets", "dataset_import_jobs", "historical_sensors", "historical_measurements", "experiment_actions"}
    missing = required - tables
    if missing: fail("Missing historical tables: " + ", ".join(sorted(missing)))
    check_migrations(settings.database_mode)
    async with SessionLocal() as db:
        orgs = (await db.scalars(select(Organization).order_by(Organization.name))).all()
        if orgs:
            print("\nOrganizations:")
            for i, org in enumerate(orgs, 1): print(f"  {i}. {org.name} ({org.slug})")
            choice = input("Select organization number, or press Enter for the first: ").strip()
            org = orgs[int(choice)-1] if choice else orgs[0]
        else:
            if input("No organizations exist. Create 'ChillPath Demo'? [y/N]: ").strip().lower() != "y": fail("No tenant selected.")
            org = Organization(name="ChillPath Demo", slug="chillpath-demo")
            db.add(org); await db.commit(); await db.refresh(org)
            print(f"Created demo organization {org.slug} ({org.id})")
        print(f"\nImporting for {org.name}. Streaming batches are handled by the existing importer...")
        dataset, result = await import_dataset(db, archive, actions, org.id)
        counts = {
            "measurements": await db.scalar(select(func.count()).select_from(HistoricalMeasurement).where(HistoricalMeasurement.dataset_id == dataset.id)),
            "actions": await db.scalar(select(func.count()).select_from(ExperimentAction).where(ExperimentAction.dataset_id == dataset.id)),
        }
        report = f"ChillPath historical import verification\nDataset: {dataset.id}\nOrganization: {org.id}\nStatus: {result.get('status')}\nMeasurements: {counts['measurements']} (expected {EXPECTED_MEASUREMENTS})\nActions: {counts['actions']} (expected {EXPECTED_ACTIONS})\n"
        REPORT.write_text(report, encoding="utf-8")
        print("\n" + report)
        print(f"Report saved to {REPORT}")
        print("Idempotency: rerunning this tool with the same archive is safe and will report duplicate.")

if __name__ == "__main__":
    try: asyncio.run(run())
    except KeyboardInterrupt: print("\nCancelled. No replay or SMS was started.")
    finally: input("\nPress Enter to close...")

"""Import the supplied historical research files into a tenant-scoped database."""
import argparse, asyncio
from pathlib import Path
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.db.session import engine
from app.db.base import Base
import app.models  # noqa: F401 — register all tables before local imports
from app.models.identity import Organization
from app.services.historical_import import import_dataset

async def main(args):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        org = await db.scalar(select(Organization).where(Organization.slug == args.organization_slug))
        if org is None:
            raise SystemExit(f"Organization '{args.organization_slug}' was not found. Register it first via /v1/auth/register.")
        actions = args.actions
        if actions is None:
            candidate = (Path(args.archive) if Path(args.archive).is_dir() else Path(args.archive).parent) / "experiment_actions.csv"
            actions = str(candidate) if candidate.exists() else None
        dataset, report = await import_dataset(db, args.archive, actions, org.id, args.source_timezone)
        print(report)
        print(f"dataset_id={dataset.id} organization_id={org.id}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, help="ZIP archive or directory containing SENSOR01..SENSOR09 CSV files")
    parser.add_argument("--actions", default=None, help="Optional experiment_actions.csv")
    parser.add_argument("--organization-slug", required=True)
    parser.add_argument("--source-timezone", default=None)
    asyncio.run(main(parser.parse_args()))

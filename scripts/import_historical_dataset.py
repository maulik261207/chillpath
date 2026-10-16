"""Import the supplied historical research files into a tenant-scoped database."""
import argparse, asyncio
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.identity import Organization
from app.services.historical_import import import_dataset

async def main(args):
    async with SessionLocal() as db:
        org = await db.scalar(select(Organization).where(Organization.slug == args.organization_slug))
        if org is None:
            raise SystemExit(f"Organization '{args.organization_slug}' was not found. Register it first via /v1/auth/register.")
        dataset, report = await import_dataset(db, args.archive, args.actions, org.id, args.source_timezone)
        print(report)
        print(f"dataset_id={dataset.id} organization_id={org.id}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--actions", required=True)
    parser.add_argument("--organization-slug", required=True)
    parser.add_argument("--source-timezone", default=None)
    asyncio.run(main(parser.parse_args()))

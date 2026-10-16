"""Read-only historical research analytics endpoints.

Historical measurements stay separate from live hardware and simulated shipment
telemetry. All queries are tenant scoped and return bounded chart payloads.
"""
from datetime import datetime
from math import ceil
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from app.db.session import SessionLocal
from app.core.config import get_settings
from app.models.historical import ExperimentAction, HistoricalDataset, HistoricalMeasurement, HistoricalSensor
from app.models.identity import Organization

router = APIRouter(prefix="/historical", tags=["historical intelligence"])


@router.get("/local-workspace")
async def local_workspace():
    """Resolve the imported research tenant only for the local SQLite workflow."""
    if get_settings().database_mode.lower() != "sqlite":
        raise HTTPException(404, "local historical workspace is unavailable")
    async with SessionLocal() as db:
        row = (await db.execute(
            select(Organization.id, Organization.name)
            .join(HistoricalDataset, HistoricalDataset.organization_id == Organization.id)
            .order_by(HistoricalDataset.created_at.desc())
            .limit(1)
        )).first()
        if row is None:
            raise HTTPException(404, "no imported historical workspace found")
        return {"organization_id": str(row.id), "organization_name": row.name}


async def _dataset(db, dataset_id: UUID, organization_id: UUID) -> HistoricalDataset:
    row = await db.scalar(select(HistoricalDataset).where(
        HistoricalDataset.id == dataset_id,
        HistoricalDataset.organization_id == organization_id,
    ))
    if row is None:
        raise HTTPException(404, "historical dataset not found")
    return row


@router.get("/datasets")
async def list_datasets(organization_id: UUID):
    async with SessionLocal() as db:
        rows = (await db.scalars(select(HistoricalDataset)
            .where(HistoricalDataset.organization_id == organization_id)
            .order_by(HistoricalDataset.created_at.desc()))).all()
        items = []
        for row in rows:
            sensors = (await db.scalars(select(HistoricalSensor)
                .where(HistoricalSensor.dataset_id == row.id)
                .order_by(HistoricalSensor.sensor_id))).all()
            items.append({
                "id": str(row.id), "name": row.name, "status": row.status,
                "provenance": row.provenance, "source_timezone": row.source_timezone,
                "created_at": row.created_at.isoformat(),
                "quality_report": row.quality_report or {},
                "sensors": [{"sensor_id": s.sensor_id, "rows": s.row_count,
                             "missing_temperature": s.missing_temperature,
                             "missing_humidity": s.missing_humidity} for s in sensors],
            })
        return {"source": "HISTORICAL_RESEARCH", "items": items}


@router.get("/datasets/{dataset_id}/summary")
async def dataset_summary(dataset_id: UUID, organization_id: UUID):
    async with SessionLocal() as db:
        await _dataset(db, dataset_id, organization_id)
        rows = (await db.execute(select(
            HistoricalMeasurement.sensor_id,
            func.count().label("total"),
            func.count(HistoricalMeasurement.temperature_c).label("temperature_valid"),
            func.count(HistoricalMeasurement.humidity_pct).label("humidity_valid"),
            func.min(HistoricalMeasurement.temperature_c).label("temperature_min_c"),
            func.max(HistoricalMeasurement.temperature_c).label("temperature_max_c"),
            func.avg(HistoricalMeasurement.temperature_c).label("temperature_avg_c"),
            func.min(HistoricalMeasurement.humidity_pct).label("humidity_min_pct"),
            func.max(HistoricalMeasurement.humidity_pct).label("humidity_max_pct"),
            func.avg(HistoricalMeasurement.humidity_pct).label("humidity_avg_pct"),
            func.min(HistoricalMeasurement.original_timestamp).label("first_timestamp"),
            func.max(HistoricalMeasurement.original_timestamp).label("last_timestamp"),
        ).where(HistoricalMeasurement.dataset_id == dataset_id)
         .group_by(HistoricalMeasurement.sensor_id)
         .order_by(HistoricalMeasurement.sensor_id))).all()
        return {"source": "HISTORICAL_RESEARCH", "sensors": [
            {"sensor_id": row.sensor_id, "total": row.total,
             "temperature_valid": row.temperature_valid, "humidity_valid": row.humidity_valid,
             "temperature_missing": row.total - row.temperature_valid,
             "humidity_missing": row.total - row.humidity_valid,
             "completeness_pct": round(row.temperature_valid / row.total * 100, 2) if row.total else 0,
             "temperature_min_c": row.temperature_min_c, "temperature_max_c": row.temperature_max_c,
             "temperature_avg_c": round(row.temperature_avg_c, 3) if row.temperature_avg_c is not None else None,
             "humidity_min_pct": row.humidity_min_pct, "humidity_max_pct": row.humidity_max_pct,
             "humidity_avg_pct": round(row.humidity_avg_pct, 3) if row.humidity_avg_pct is not None else None,
             "first_timestamp": row.first_timestamp.isoformat() if row.first_timestamp else None,
             "last_timestamp": row.last_timestamp.isoformat() if row.last_timestamp else None}
            for row in rows
        ]}


@router.get("/datasets/{dataset_id}/series")
async def dataset_series(
    dataset_id: UUID,
    organization_id: UUID,
    sensor_ids: list[str] = Query(default=[]),
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = Query(1200, ge=60, le=5000),
):
    async with SessionLocal() as db:
        await _dataset(db, dataset_id, organization_id)
        filters = [HistoricalMeasurement.dataset_id == dataset_id]
        if sensor_ids:
            filters.append(HistoricalMeasurement.sensor_id.in_(sensor_ids))
        if start:
            filters.append(HistoricalMeasurement.original_timestamp >= start.replace(tzinfo=None))
        if end:
            filters.append(HistoricalMeasurement.original_timestamp <= end.replace(tzinfo=None))
        counts = (await db.execute(select(
            HistoricalMeasurement.sensor_id, func.count().label("count")
        ).where(*filters).group_by(HistoricalMeasurement.sensor_id))).all()
        if not counts:
            return {"source": "HISTORICAL_RESEARCH", "points": [], "sampled": False}
        stride = max(1, ceil(max(row.count for row in counts) / limit))
        row_number = func.row_number().over(
            partition_by=HistoricalMeasurement.sensor_id,
            order_by=HistoricalMeasurement.original_timestamp,
        ).label("row_number")
        sampled = select(
            HistoricalMeasurement.sensor_id,
            HistoricalMeasurement.original_timestamp,
            HistoricalMeasurement.temperature_c,
            HistoricalMeasurement.humidity_pct,
            HistoricalMeasurement.temperature_missing,
            HistoricalMeasurement.humidity_missing,
            row_number,
        ).where(*filters).subquery()
        rows = (await db.execute(select(sampled).where(
            or_(sampled.c.row_number == 1, sampled.c.row_number % stride == 0)
        ).order_by(sampled.c.original_timestamp, sampled.c.sensor_id))).all()
        return {"source": "HISTORICAL_RESEARCH", "sampled": stride > 1, "stride": stride,
                "points": [{"sensor_id": row.sensor_id, "observed_at": row.original_timestamp.isoformat(),
                            "temperature_c": row.temperature_c, "humidity_pct": row.humidity_pct,
                            "temperature_missing": row.temperature_missing, "humidity_missing": row.humidity_missing}
                           for row in rows]}


@router.get("/datasets/{dataset_id}/actions")
async def dataset_actions(dataset_id: UUID, organization_id: UUID):
    async with SessionLocal() as db:
        await _dataset(db, dataset_id, organization_id)
        rows = (await db.scalars(select(ExperimentAction)
            .where(ExperimentAction.dataset_id == dataset_id)
            .order_by(ExperimentAction.original_start))).all()
        return {"source": "HISTORICAL_RESEARCH", "items": [
            {"action": row.action, "start": row.original_start.isoformat(), "end": row.original_end.isoformat()}
            for row in rows
        ]}

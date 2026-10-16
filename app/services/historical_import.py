"""Safe streaming parser for the ChillPath historical research dataset."""
import csv, hashlib, io, zipfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import PurePosixPath
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.historical import HistoricalDataset, DatasetImportJob, HistoricalSensor, HistoricalMeasurement, ExperimentAction

EXPECTED = {f"SENSOR{i:02d}_preprocessed.csv" for i in range(1, 10)}
ACTION_FILE = "experiment_actions.csv"
MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
MAX_MEMBER_BYTES = 100 * 1024 * 1024

@dataclass
class SensorReport:
    rows: int = 0
    missing_temperature: int = 0
    missing_humidity: int = 0
    invalid_rows: int = 0
    first_timestamp: str | None = None
    last_timestamp: str | None = None

@dataclass
class ImportReport:
    sensors: dict[str, SensorReport] = field(default_factory=dict)
    actions: int = 0
    errors: list[str] = field(default_factory=list)

def validate_zip(path: str | Path) -> list[str]:
    p = Path(path)
    if p.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("archive exceeds maximum allowed size")
    with zipfile.ZipFile(p) as archive:
        names = {i.filename for i in archive.infolist()}
        for info in archive.infolist():
            parts = PurePosixPath(info.filename)
            if parts.is_absolute() or ".." in parts.parts:
                raise ValueError(f"unsafe archive path: {info.filename}")
            if info.file_size > MAX_MEMBER_BYTES:
                raise ValueError(f"archive member too large: {info.filename}")
        unexpected = names - EXPECTED
        missing = EXPECTED - names
        if unexpected or missing:
            raise ValueError(f"unexpected members={sorted(unexpected)} missing={sorted(missing)}")
        return sorted(names)

def parse_timestamp(date_text: str, time_text: str) -> datetime:
    return datetime.strptime(f"{date_text.strip()} {time_text.strip()}", "%d.%m.%Y %H:%M:%S")

def iter_measurements(stream: io.TextIOBase, sensor_id: str):
    reader = csv.DictReader(stream, delimiter=";")
    if reader.fieldnames != ["Date", "Time", "Temperature", "Humidity"]:
        raise ValueError(f"{sensor_id}: unexpected CSV columns {reader.fieldnames}")
    for row_number, row in enumerate(reader, start=2):
        timestamp = parse_timestamp(row["Date"], row["Time"])
        def number(key: str):
            value = (row.get(key) or "").strip()
            return None if not value else float(value)
        temperature, humidity = number("Temperature"), number("Humidity")
        if temperature is not None and not -100 <= temperature <= 100:
            raise ValueError(f"{sensor_id} row {row_number}: temperature outside physical bounds")
        if humidity is not None and not 0 <= humidity <= 100:
            raise ValueError(f"{sensor_id} row {row_number}: humidity outside physical bounds")
        yield row_number, timestamp, temperature, humidity

def parse_archive(path: str | Path) -> ImportReport:
    validate_zip(path)
    report = ImportReport()
    with zipfile.ZipFile(path) as archive:
        for name in sorted(EXPECTED):
            sensor_id = name.split("_", 1)[0]
            stats = report.sensors[sensor_id] = SensorReport()
            with archive.open(name) as raw:
                text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
                try:
                    for _, ts, temp, humidity in iter_measurements(text, sensor_id):
                        stats.rows += 1
                        stats.missing_temperature += temp is None
                        stats.missing_humidity += humidity is None
                        stats.first_timestamp = stats.first_timestamp or ts.isoformat()
                        stats.last_timestamp = ts.isoformat()
                except (ValueError, UnicodeError) as exc:
                    report.errors.append(str(exc))
    return report

def file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

async def import_dataset(db: AsyncSession, archive_path: str | Path, actions_path: str | Path,
                         organization_id, source_timezone: str | None = None, batch_size: int = 5000):
    """Import measurements and actions in bounded batches; repeated content is a no-op."""
    digest = file_sha256(archive_path)
    existing = await db.scalar(select(HistoricalDataset).where(
        HistoricalDataset.organization_id == organization_id,
        HistoricalDataset.content_sha256 == digest))
    if existing:
        return existing, {"status": "duplicate", "dataset_id": str(existing.id)}
    dataset = HistoricalDataset(organization_id=organization_id, name=Path(archive_path).name,
        content_sha256=digest, source_timezone=source_timezone)
    db.add(dataset); await db.flush()
    job = DatasetImportJob(dataset_id=dataset.id, organization_id=organization_id)
    db.add(job); await db.flush()
    report = ImportReport()
    try:
        validate_zip(archive_path)
        with zipfile.ZipFile(archive_path) as archive:
            for name in sorted(EXPECTED):
                sensor_id = name.split("_", 1)[0]
                sensor = HistoricalSensor(dataset_id=dataset.id, sensor_id=sensor_id, source_filename=name)
                db.add(sensor); await db.flush()
                stats = report.sensors[sensor_id] = SensorReport()
                batch = []
                with archive.open(name) as raw:
                    text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
                    for row_number, ts, temp, humidity in iter_measurements(text, sensor_id):
                        stats.rows += 1; stats.missing_temperature += temp is None; stats.missing_humidity += humidity is None
                        batch.append(HistoricalMeasurement(dataset_id=dataset.id, import_job_id=job.id,
                            sensor_id=sensor_id, source_filename=name, source_row_number=row_number,
                            original_timestamp=ts, temperature_c=temp, humidity_pct=humidity,
                            temperature_missing=temp is None, humidity_missing=humidity is None))
                        if len(batch) >= batch_size:
                            db.add_all(batch); await db.flush(); batch.clear()
                    if batch: db.add_all(batch); await db.flush()
                sensor.row_count, sensor.missing_temperature, sensor.missing_humidity = stats.rows, stats.missing_temperature, stats.missing_humidity
                job.accepted_rows += stats.rows
            with open(actions_path, encoding="utf-8", newline="") as handle:
                for row_number, row in enumerate(csv.DictReader(handle, delimiter=";"), start=2):
                    start = datetime.strptime(f"{row['Date']} {row['Start Time']}", "%Y-%m-%d %H:%M:%S")
                    end = datetime.strptime(f"{row['Date']} {row['End Time']}", "%Y-%m-%d %H:%M:%S")
                    db.add(ExperimentAction(dataset_id=dataset.id, source_row_number=row_number, action=row["Action"], original_start=start, original_end=end))
                    report.actions += 1
        dataset.quality_report = {"sensors": {k: vars(v) for k, v in report.sensors.items()}, "actions": report.actions}
        job.status = dataset.status = "IMPORTED"
        await db.commit()
        return dataset, {"status": "imported", **dataset.quality_report}
    except Exception as exc:
        await db.rollback()
        raise RuntimeError(f"historical import failed: {exc}") from exc

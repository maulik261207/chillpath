from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.devices import IoTDevice, SensorCapabilityManifest
from app.models.shipping import Sensor
from app.schemas.devices import DeviceCreate, SensorManifestUpsert

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("")
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(IoTDevice).where(IoTDevice.hardware_uid == payload.hardware_uid))
    if existing:
        raise HTTPException(409, "hardware UID already registered")
    row = IoTDevice(**payload.model_dump())
    db.add(row); await db.commit(); await db.refresh(row)
    return row


@router.post("/{device_id}/sensor-manifest")
async def upsert_manifest(device_id: UUID, payload: SensorManifestUpsert, db: AsyncSession = Depends(get_db)):
    device = await db.scalar(select(IoTDevice).where(IoTDevice.id == device_id, IoTDevice.organization_id == payload.organization_id))
    sensor = await db.scalar(select(Sensor).where(Sensor.id == payload.sensor_id, Sensor.organization_id == payload.organization_id))
    if device is None or sensor is None:
        raise HTTPException(404, "device or sensor not found in organization")
    row = await db.scalar(select(SensorCapabilityManifest).where(SensorCapabilityManifest.device_id == device_id, SensorCapabilityManifest.sensor_id == payload.sensor_id))
    values = payload.model_dump(exclude={"capabilities", "unit_map"})
    values["capabilities_json"] = payload.capabilities
    values["unit_map_json"] = payload.unit_map
    if row is None:
        row = SensorCapabilityManifest(device_id=device_id, **values)
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    await db.commit(); await db.refresh(row)
    return row


@router.get("/{device_id}/sensor-manifest")
async def get_manifest(device_id: UUID, organization_id: UUID, db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(SensorCapabilityManifest).where(SensorCapabilityManifest.device_id == device_id, SensorCapabilityManifest.organization_id == organization_id))).all()
    return {"items": rows}


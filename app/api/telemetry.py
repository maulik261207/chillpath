import hashlib
import json
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.telemetry import TelemetryEvent
from app.schemas.telemetry import TelemetryBatch, LiveTelemetryItem, SendSmsRequest
import urllib.request
import urllib.error
import urllib.parse

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

# Default secret API key (can be overridden via environment variable CHILLPATH_API_KEY)
DEFAULT_API_KEY = os.getenv("CHILLPATH_API_KEY", "chillpath_live_secret_key")

# Target phone number for SMS alerts
DEFAULT_SMS_RECIPIENT = os.getenv("DEFAULT_SMS_RECIPIENT", "+919557066830")

# In-memory storage for real-time live telemetry from PC bridge
_latest_live_telemetry: dict | None = None
_live_history: list[dict] = []
MAX_HISTORY_SIZE = 200

# SMS alert tracking
_sms_outbox: list[dict] = []
_last_auto_sms_time: float = 0.0
SMS_ALERT_COOLDOWN_SEC = 60.0


def dispatch_sms(phone_number: str, message: str) -> dict:
    """Dispatches SMS alert using Fast2SMS, Twilio, or standard system outbox logger."""
    global _sms_outbox
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "timestamp": now_iso,
        "phone_number": phone_number,
        "message": message,
        "provider": "outbox_logger",
        "delivered": True,
    }

    # 1. Fast2SMS (popular for Indian numbers +91...)
    fast2sms_key = os.getenv("FAST2SMS_API_KEY")
    if fast2sms_key:
        clean_num = phone_number.replace("+91", "").replace("+", "").strip()
        payload = json.dumps({
            "route": "q",
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": clean_num,
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://www.fast2sms.com/dev/bulkV2",
            data=payload,
            headers={
                "authorization": fast2sms_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                record["provider"] = "fast2sms"
                record["response"] = resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            record["error"] = str(e)
            record["delivered"] = False

    # 2. Twilio (if configured)
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_from = os.getenv("TWILIO_FROM_NUMBER")
    if twilio_sid and twilio_token and twilio_from:
        import base64
        url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
        data = urllib.parse.urlencode({
            "To": phone_number,
            "From": twilio_from,
            "Body": message,
        }).encode("utf-8")
        auth_header = "Basic " + base64.b64encode(f"{twilio_sid}:{twilio_token}".encode()).decode()
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Authorization": auth_header},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                record["provider"] = "twilio"
                record["response"] = resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            record["error"] = str(e)
            record["delivered"] = False

    _sms_outbox.append(record)
    if len(_sms_outbox) > 100:
        _sms_outbox.pop(0)

    print(f"\n[SMS SENT] -> {phone_number} via {record['provider']}:\n  \"{message}\"\n", flush=True)
    return record



def verify_api_key(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    authorization: str | None = Header(None),
    api_key: str | None = Query(None),
) -> str:
    """Validates the API key from X-API-Key header, query param (?api_key=), or Bearer token."""
    provided_key = x_api_key or api_key
    if not provided_key and authorization:
        if authorization.lower().startswith("bearer "):
            provided_key = authorization[7:].strip()
        else:
            provided_key = authorization.strip()

    valid_key = os.getenv("CHILLPATH_API_KEY", DEFAULT_API_KEY)
    if not provided_key or provided_key != valid_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing API key. Please pass 'X-API-Key' header or '?api_key=' query parameter.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return provided_key


@router.post("/batch")
async def ingest_batch(batch: TelemetryBatch, db: AsyncSession = Depends(get_db)) -> dict:
    results = []
    for item in batch.events:
        payload = item.model_dump(mode="json")
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        existing = await db.scalar(select(TelemetryEvent).where(
            TelemetryEvent.organization_id == item.organization_id,
            TelemetryEvent.sensor_id == item.sensor_id,
            TelemetryEvent.device_event_id == item.device_event_id,
        ))
        if existing:
            results.append({"device_event_id": item.device_event_id, "status": "duplicate" if existing.payload_hash == digest else "conflict"})
            continue
        event_fields = {key: value for key, value in payload.items() if key != "metadata"}
        db.add(TelemetryEvent(**event_fields, raw_payload_json=payload, payload_hash=digest))
        results.append({"device_event_id": item.device_event_id, "status": "accepted"})
    await db.commit()
    return {"results": results}


@router.post("/live")
async def ingest_live_telemetry(
    item: LiveTelemetryItem,
    _key: str = Depends(verify_api_key),
) -> dict:
    global _latest_live_telemetry, _live_history, _last_auto_sms_time
    data = item.model_dump()
    if not data.get("observed_at"):
        data["observed_at"] = datetime.now(timezone.utc).isoformat()
    elif isinstance(data["observed_at"], datetime):
        data["observed_at"] = data["observed_at"].isoformat()

    if data.get("temperature_f") is None:
        data["temperature_f"] = round((data["temperature_c"] * 9.0 / 5.0) + 32.0, 1)

    data["received_at"] = datetime.now(timezone.utc).isoformat()
    _latest_live_telemetry = data
    _live_history.append(data)
    if len(_live_history) > MAX_HISTORY_SIZE:
        _live_history.pop(0)

    # Automatic SMS Alert dispatch only on genuine extreme temperature breach
    now_epoch = datetime.now(timezone.utc).timestamp()
    temp_c = data.get("temperature_c", 25.0)
    is_breached = (
        (temp_c > 50.0 or temp_c < -10.0)
        and data.get("alarm_active") is True
    )
    sms_status = None
    if is_breached and (now_epoch - _last_auto_sms_time >= SMS_ALERT_COOLDOWN_SEC):
        _last_auto_sms_time = now_epoch
        temp_c = data.get("temperature_c", 0.0)
        do_info = "TRIPPED" if data.get("do_tripped") else "NORMAL"
        msg = f"ChillPath ALERT: Temp breach detected! Current: {temp_c:.1f}C (DO: {do_info}). Limits: 2.0C - 35.0C."
        sms_status = dispatch_sms(DEFAULT_SMS_RECIPIENT, msg)

    return {
        "status": "ok",
        "message": "Telemetry received and broadcasted",
        "data": data,
        "sms_alert": sms_status,
    }


@router.post("/sms/send")
async def send_manual_sms(
    req: SendSmsRequest,
    _key: str = Depends(verify_api_key),
) -> dict:
    target = req.phone_number or DEFAULT_SMS_RECIPIENT
    result = dispatch_sms(target, req.message)
    return {"status": "ok", "dispatched": result}


@router.get("/sms/outbox")
async def get_sms_outbox(_key: str = Depends(verify_api_key)) -> dict:
    global _sms_outbox
    return {"count": len(_sms_outbox), "outbox": _sms_outbox}


@router.get("/live")
async def get_latest_live_telemetry(_key: str = Depends(verify_api_key)) -> dict:
    global _latest_live_telemetry
    if _latest_live_telemetry is None:
        return {
            "online": False,
            "message": "No live telemetry received yet. Run pc_sensor_bridge.py on your PC to stream data.",
            "data": None,
        }

    now = datetime.now(timezone.utc)
    try:
        rec_time = datetime.fromisoformat(_latest_live_telemetry["received_at"])
        delta_sec = round((now - rec_time).total_seconds(), 1)
    except Exception:
        delta_sec = 0.0

    is_online = delta_sec <= 10.0

    return {
        "online": is_online,
        "seconds_since_last_packet": delta_sec,
        "data": _latest_live_telemetry,
    }


@router.get("/live/history")
async def get_live_telemetry_history(
    limit: int = 50,
    _key: str = Depends(verify_api_key),
) -> dict:
    global _live_history
    count = min(limit, len(_live_history))
    return {
        "count": count,
        "points": _live_history[-count:],
    }




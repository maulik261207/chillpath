from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.core.errors import http_error_handler, unhandled_error_handler, validation_error_handler
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException
from app.api.auth import router as auth_router
from app.api.shipping import router as shipping_router
from app.api.telemetry import router as telemetry_router
from app.api.operations import router as operations_router
from app.api.read_models import router as read_models_router
from app.api.billing import router as billing_router
from app.api.scenarios import router as scenarios_router
from app.api.recovery import router as recovery_router
from app.api.devices import router as devices_router
from app.api.maps import router as maps_router
from app.api.engines import router as engines_router
from app.api.road_intelligence import router as road_intelligence_router
from app.api.shipment_route_context import router as shipment_route_context_router
from app.db.base import Base
from app.db.session import engine
import app.models  # noqa: F401 — register every model in SQLAlchemy metadata.

settings = get_settings()
@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_schema:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_exception_handler(Exception, unhandled_error_handler)
app.add_exception_handler(HTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(shipping_router, prefix=settings.api_prefix)
app.include_router(telemetry_router, prefix=settings.api_prefix)
app.include_router(operations_router, prefix=settings.api_prefix)
app.include_router(read_models_router, prefix=settings.api_prefix)
app.include_router(billing_router, prefix=settings.api_prefix)
app.include_router(scenarios_router, prefix=settings.api_prefix)
app.include_router(recovery_router, prefix=settings.api_prefix)
app.include_router(devices_router, prefix=settings.api_prefix)
app.include_router(maps_router, prefix=settings.api_prefix)
app.include_router(engines_router, prefix=settings.api_prefix)
app.include_router(road_intelligence_router, prefix=settings.api_prefix)
app.include_router(shipment_route_context_router, prefix=settings.api_prefix)


@app.get("/health/live", tags=["health"])
async def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def ready() -> dict[str, str]:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@app.get("/live", tags=["dashboard"])
@app.get("/dashboard", tags=["dashboard"])
@app.get("/gateway", tags=["dashboard"])
async def live_sensor_dashboard(request: Request):
    from pathlib import Path
    from datetime import datetime, timezone
    from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
    from app.api.telemetry import _latest_live_telemetry

    accept = request.headers.get("accept", "")
    wants_json = (
        "application/json" in accept
        or request.query_params.get("format") == "json"
        or "x-api-key" in request.headers
        or "api_key" in request.query_params
    )

    if wants_json:
        if _latest_live_telemetry is None:
            return JSONResponse({
                "online": False,
                "message": "No live telemetry received yet. Run pc_sensor_bridge.py on your PC to stream data.",
                "data": None,
            })
        now = datetime.now(timezone.utc)
        rx_str = _latest_live_telemetry.get("received_at", now.isoformat())
        try:
            rx = datetime.fromisoformat(rx_str)
            age = (now - rx).total_seconds()
        except Exception:
            age = 0.0
        return JSONResponse({
            "online": age < 15.0,
            "seconds_since_last_packet": round(age, 1),
            "data": _latest_live_telemetry,
        })

    path = Path(__file__).resolve().parent.parent / "test_web_api.html"
    if path.exists():
        return FileResponse(path, media_type="text/html")
    return HTMLResponse("<h3>Dashboard HTML not found</h3>", status_code=404)





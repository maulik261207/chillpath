from fastapi import FastAPI

from app.core.config import get_settings
from app.core.errors import unhandled_error_handler
from app.api.auth import router as auth_router
from app.api.shipping import router as shipping_router
from app.api.telemetry import router as telemetry_router
from app.api.operations import router as operations_router
from app.api.read_models import router as read_models_router
from app.api.billing import router as billing_router

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_exception_handler(Exception, unhandled_error_handler)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(shipping_router, prefix=settings.api_prefix)
app.include_router(telemetry_router, prefix=settings.api_prefix)
app.include_router(operations_router, prefix=settings.api_prefix)
app.include_router(read_models_router, prefix=settings.api_prefix)
app.include_router(billing_router, prefix=settings.api_prefix)


@app.get("/health/live", tags=["health"])
async def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def ready() -> dict[str, str]:
    return {"status": "ok", "database": "not_checked"}


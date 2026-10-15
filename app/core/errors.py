from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "code": "internal_error",
            "message": "An unexpected error occurred.",
            "details": {},
            "request_id": request.headers.get("x-request-id"),
        },
    )


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(status_code=exc.status_code, content={
        "code": "request_error",
        "message": detail,
        "details": {} if isinstance(exc.detail, str) else exc.detail,
        "request_id": request.headers.get("x-request-id"),
    })


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={
        "code": "validation_error",
        "message": "Request validation failed.",
        "details": exc.errors(),
        "request_id": request.headers.get("x-request-id"),
    })


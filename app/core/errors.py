from fastapi import Request
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


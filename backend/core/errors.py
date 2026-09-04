"""One consistent error-response JSON shape for every endpoint.

Every error response — a raised `HTTPException`, a Pydantic validation
failure, or an unhandled exception — is rendered as:

    {"error": {"code": "not_found", "message": "...", "details": {...}}}

`code` is a stable, machine-readable slug (snake_case, derived from the
HTTP status by default) that API clients can branch on without parsing
`message`, which is free text for humans and may change wording over time.
"""

from __future__ import annotations

import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

_STATUS_CODE_SLUGS = {
    status.HTTP_400_BAD_REQUEST: "bad_request",
    status.HTTP_401_UNAUTHORIZED: "unauthorized",
    status.HTTP_403_FORBIDDEN: "forbidden",
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_409_CONFLICT: "conflict",
    status.HTTP_422_UNPROCESSABLE_ENTITY: "validation_error",
    status.HTTP_429_TOO_MANY_REQUESTS: "rate_limited",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "internal_error",
}


def _code_for_status(status_code: int) -> str:
    if status_code in _STATUS_CODE_SLUGS:
        return _STATUS_CODE_SLUGS[status_code]
    try:
        return HTTPStatus(status_code).phrase.lower().replace(" ", "_")
    except ValueError:
        return "error"


def error_response(
    status_code: int, message: str, details: dict[str, Any] | None = None
) -> JSONResponse:
    """Build the standard error envelope as a JSONResponse."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": _code_for_status(status_code),
                "message": message,
                "details": details or {},
            }
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Wire the standard error envelope up for every error path FastAPI can
    hit: explicit HTTPExceptions, request validation failures, and anything
    unhandled (which is logged with a stack trace and never leaks internals
    to the client)."""

    @app.exception_handler(HTTPException)
    async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return error_response(exc.status_code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Request failed validation",
            details={"errors": exc.errors()},
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled exception while handling %s %s", request.method, request.url.path
        )
        return error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")

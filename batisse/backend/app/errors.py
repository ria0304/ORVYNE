"""Uniform, human-readable API errors: {"error": {"code", "message", "details"}}."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .processing.loader import InputError


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: object | None = None):
        self.status, self.code, self.message, self.details = status, code, message, details


def _payload(code: str, message: str, details: object | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=_payload(exc.code, exc.message, exc.details))

    @app.exception_handler(InputError)
    async def _input(_: Request, exc: InputError):
        return JSONResponse(status_code=422, content=_payload("invalid_input", str(exc)))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p not in ("body",)), "message": e["msg"]}
            for e in exc.errors()
        ]
        first = fields[0] if fields else {"field": "", "message": "invalid request"}
        msg = f"Invalid request: {first['field'] or 'body'}: {first['message']}"
        return JSONResponse(status_code=422, content=_payload("validation_error", msg, fields))

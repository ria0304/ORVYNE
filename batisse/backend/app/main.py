"""Bâtisse API entrypoint. Run: ``uvicorn app.main:app --reload``."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .database import init_db
from .errors import install_error_handlers
from .routers import furniture, geometry, processing, projects, uploads


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.ensure_dirs()
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Bâtisse API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
    )
    install_error_handlers(app)

    @app.get("/api/health", tags=["meta"])
    def health():
        from .processing.detect import DetectorParams  # noqa: F401
        import shutil

        return {
            "status": "ok",
            "version": "0.1.0",
            "tesseract_available": shutil.which("tesseract") is not None,
        }

    for r in (projects.router, uploads.router, processing.router, geometry.router, furniture.router):
        app.include_router(r, prefix="/api")
    return app


app = create_app()

"""Application settings (environment-driven, with safe local defaults)."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("PLAN2REALITY_DATA", BASE_DIR / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
PLAN_DIR = DATA_DIR / "plans"
ASSET_DIR = DATA_DIR / "assets"
DATABASE_URL = os.environ.get("PLAN2REALITY_DB", f"sqlite:///{DATA_DIR / 'plan2reality.db'}")
MAX_UPLOAD_BYTES = int(os.environ.get("PLAN2REALITY_MAX_UPLOAD_MB", "25")) * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".pdf": "pdf"}
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("PLAN2REALITY_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]


def ensure_dirs() -> None:
    for d in (DATA_DIR, UPLOAD_DIR, PLAN_DIR, ASSET_DIR):
        d.mkdir(parents=True, exist_ok=True)

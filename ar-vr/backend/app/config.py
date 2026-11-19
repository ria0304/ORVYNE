"""ar-vr Integration Layer — Environment-based configuration.

All secrets and settings are loaded from .env files or OS environment variables.
Never commit .env files to version control.
"""

from __future__ import annotations

import os
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()


# ─── Integration Service Identity ─────────────────────────────────────────────

APP_NAME = os.getenv("APP_NAME", "ar-vr-integration")
APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# ─── Service URLs (existing projects) ────────────────────────────────────────

# BATISSE — Floor plan to 3D dollhouse
BATISSE_BASE_URL = os.getenv(
    "BATISSE_BASE_URL",
    "http://127.0.0.1:8000",
)

# WYA — AI-powered wardrobe intelligence
WYA_BASE_URL = os.getenv(
    "WYA_BASE_URL",
    "http://127.0.0.1:8000",
)

# TryOn — Virtual clothing try-on
TRYON_BASE_URL = os.getenv(
    "TRYON_BASE_URL",
    "http://127.0.0.1:8000",
)

# VELARIS — AI-powered jewellery design
VELARIS_BASE_URL = os.getenv(
    "VELARIS_BASE_URL",
    "http://127.0.0.1:8000",
)

# ─── Authentication ──────────────────────────────────────────────────────────

# Central JWT secret for service-to-service tokens (issued by central auth,
# or generated here for development). User tokens from each project are NEVER
# shared across services; instead, the integration layer validates that a user
# has authorized access to the requested resource via per-project JWTs.
INTEGRATION_JWT_SECRET = os.getenv(
    "INTEGRATION_JWT_SECRET",
    "ar-vr-dev-secret-change-in-production",
)

# ─── Database ─────────────────────────────────────────────────────────────────

# Shared integration database — SQLite for development, PostgreSQL for production.
# Each project retains its own independent database; this is a coordination DB
# for integration metadata only.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./arvr_integration.db",
)

# ─── WYA API ─────────────────────────────────────────────────────────────────

# WYA backend URL (local development or production)
WYA_BASE_URL = os.getenv("WYA_BASE_URL", "http://127.0.0.1:8000")

# ─── CORS ─────────────────────────────────────────────────────────────────────

# Frontend origins that can call the integration API
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

# ─── Model Fallback Chain (for Velaris LLM calls) ───────────────────────────

DEFAULT_MODEL_CHAIN = [
    "google/gemini-2.0-flash-lite",
    "meta-llama/llama-3.2-3b-instruct",
    "mistralai/mistral-7b-instruct",
    "google/gemini-2.5-flash",
]

# ─── Asset Directories ───────────────────────────────────────────────────────

ASSETS_DIR = os.getenv("ASSETS_DIR", str(__file__.replace("/config.py", "/assets")))
MODELS_DIR = os.getenv("MODELS_DIR", str(__file__.replace("/config.py", "/assets/models")))
TEXTURES_DIR = os.getenv("TEXTURES_DIR", str(__file__.replace("/config.py", "/assets/textures")))

# Ensure directories exist
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEXTURES_DIR, exist_ok=True)


def ensure_dirs():
    """Ensure all required directories exist."""
    os.makedirs(ASSETS_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(TEXTURES_DIR, exist_ok=True)
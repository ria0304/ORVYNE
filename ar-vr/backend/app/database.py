"""ar-vr Integration Layer — Shared database setup.

SQLite for development; PostgreSQL configurable via DATABASE_URL env var.
Each project (BATISSE, WYA, TryOn, VELARIS) retains its own independent
database. This module creates a coordination metadata table for the
integration layer only.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, Column, String, DateTime, JSON, Integer, Text, Index, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.orm import declarative_mixin

from .config import DATABASE_URL, DEBUG

# ── SQLAlchemy setup ─────────────────────────────────────────────────────────

engine = create_engine(
    DATABASE_URL,
    echo=DEBUG,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


# ── Integration metadata model ────────────────────────────────────────────────

@declarative_mixin
class BaseModelMixin:
    """Mixin providing common columns for all models."""

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class IntegrationMetadata(BaseModelMixin, Base):
    """Coordination metadata for the integration layer.

    Stores non-sensitive mapping data between user IDs across projects,
    room assignments, and asset references. No floor plan geometry or
    private wardrobe data is stored here — that remains in each project's
    own database.
    """

    __tablename__ = "integration_metadata"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), unique=True, index=True, nullable=False)  # Central user identifier
    batisse_project_id = Column(Integer, nullable=True, index=True)  # Linked BATISSE project
    room_assignments = Column(JSON, nullable=True, default=dict)  # room_id → function mapping
    __tablename__ = "integration_metadata"

    __table_args__ = (
        Index("ix_metadata_user_id", "user_id"),
    )


# ── Engine helpers ────────────────────────────────────────────────────────────

def init_db() -> None:
    """Initialize the database — create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_db_session() -> Session:
    """Get a new database session for the integration layer."""
    return SessionLocal()


def get_db() -> Generator[Session, None, None]:
    """Dependency injector that yields a DB session and ensures cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Convenience ───────────────────────────────────────────────────────────────

def get_engine() -> Any:
    """Return the SQLAlchemy engine (for advanced usage)."""
    return engine
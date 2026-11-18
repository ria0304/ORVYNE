from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    geometry_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    geometry_revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    uploads: Mapped[list["Upload"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    runs: Mapped[list["ProcessingRun"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    furniture_instances: Mapped[list["FurnitureInstance"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    scene_configs: Mapped[list["SceneConfiguration"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(8))
    size_bytes: Mapped[int] = mapped_column(Integer)
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    project: Mapped["Project"] = relationship(back_populates="uploads")


class ProcessingRun(Base):
    __tablename__ = "processing_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    upload_id: Mapped[Optional[int]] = mapped_column(ForeignKey("uploads.id", ondelete="SET NULL"), nullable=True)
    page_index: Mapped[int] = mapped_column(Integer, default=0)
    report_json: Mapped[str] = mapped_column(Text)
    plan_image_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    project: Mapped["Project"] = relationship(back_populates="runs")


class FurnitureAsset(Base):
    __tablename__ = "furniture_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40), default="other")
    description: Mapped[str] = mapped_column(Text, default="")
    image_refs: Mapped[str] = mapped_column(Text, default="[]")
    model_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    width: Mapped[float] = mapped_column(Float, default=0.0)
    height: Mapped[float] = mapped_column(Float, default=0.0)
    depth: Mapped[float] = mapped_column(Float, default=0.0)
    units: Mapped[str] = mapped_column(String(8), default="m")
    pivot_x: Mapped[float] = mapped_column(Float, default=0.0)
    pivot_y: Mapped[float] = mapped_column(Float, default=0.0)
    pivot_z: Mapped[float] = mapped_column(Float, default=0.0)
    bbox_min_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_min_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_min_z: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_max_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_max_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bbox_max_z: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    materials: Mapped[str] = mapped_column(Text, default="{}")
    textures: Mapped[str] = mapped_column(Text, default="{}")
    reconstruction_method: Mapped[str] = mapped_column(String(40), default="manual")
    reconstruction_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dimensions_confirmed: Mapped[bool] = mapped_column(default=False)
    source_type: Mapped[str] = mapped_column(String(40), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    instances: Mapped[list["FurnitureInstance"]] = relationship(back_populates="asset")


class FurnitureInstance(Base):
    __tablename__ = "furniture_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("furniture_assets.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    floor_id: Mapped[str] = mapped_column(String(40), default="floor-0")
    room_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    pos_x: Mapped[float] = mapped_column(Float, default=0.0)
    pos_y: Mapped[float] = mapped_column(Float, default=0.0)
    pos_z: Mapped[float] = mapped_column(Float, default=0.0)
    rot_x: Mapped[float] = mapped_column(Float, default=0.0)
    rot_y: Mapped[float] = mapped_column(Float, default=0.0)
    rot_z: Mapped[float] = mapped_column(Float, default=0.0)
    scale_x: Mapped[float] = mapped_column(Float, default=1.0)
    scale_y: Mapped[float] = mapped_column(Float, default=1.0)
    scale_z: Mapped[float] = mapped_column(Float, default=1.0)
    material_overrides: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    asset: Mapped["FurnitureAsset"] = relationship(back_populates="instances")
    project: Mapped["Project"] = relationship(back_populates="furniture_instances")


class SceneConfiguration(Base):
    __tablename__ = "scene_configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    placements_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    project: Mapped["Project"] = relationship(back_populates="scene_configs")
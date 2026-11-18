"""API request/response schemas (geometry itself lives in ``app.geometry.schema``)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .geometry import FloorPlanGeometry
from .processing.pipeline import ProcessingReport


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    upload_count: int = 0
    room_count: int = 0
    has_geometry: bool = False
    units: Optional[str] = None
    ready_for_3d: bool = False


class UploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    original_name: str
    kind: str
    size_bytes: int
    page_count: int
    width: int
    height: int
    created_at: datetime


class ProcessRequest(BaseModel):
    upload_id: int
    page_index: int = Field(default=0, ge=0)
    replace_existing: bool = False


class ProcessResponse(BaseModel):
    run_id: int
    geometry: FloorPlanGeometry
    report: ProcessingReport


class GeometryResponse(BaseModel):
    geometry: FloorPlanGeometry
    revision: int
    ready_for_3d: bool
    has_plan_image: bool = False


LengthUnit = Literal["m", "cm", "mm", "ft", "in"]
UNIT_TO_M = {"m": 1.0, "cm": 0.01, "mm": 0.001, "ft": 0.3048, "in": 0.0254}


class ScaleReference(BaseModel):
    """Two points in the CURRENT plan coordinates and the real length between them."""
    p1: tuple[float, float]
    p2: tuple[float, float]
    length: float = Field(gt=0)
    unit: LengthUnit = "m"


class ScaleAccept(BaseModel):
    """Accept a scale directly (e.g. a detected proposal)."""
    meters_per_pixel: float = Field(gt=0)
    source: Literal["ocr_dimension", "vector", "user_reference", "manual"]
    confidence: float = Field(ge=0, le=1)
    note: Optional[str] = None


class GeometryRebuildRequest(BaseModel):
    geometry: FloorPlanGeometry


FurnitureCategory = Literal[
    "sofa", "bed", "chair", "table", "wardrobe", "cabinet", "shelf", "desk", "dresser",
    "lighting", "decor", "other",
]
FurnitureSource = Literal["single_photo", "multi_view", "retail_image", "imported_model", "manual"]
FurnitureReconMethod = Literal["manual", "single_image", "multi_view", "imported"]


class FurnitureAssetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: FurnitureCategory = "other"
    description: str = Field(default="", max_length=2000)
    width: float = Field(default=0.0, ge=0)
    height: float = Field(default=0.0, ge=0)
    depth: float = Field(default=0.0, ge=0)
    units: LengthUnit = "m"
    source_type: FurnitureSource = "manual"
    reconstruction_method: FurnitureReconMethod = "manual"
    reconstruction_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    dimensions_confirmed: bool = False


class FurnitureAssetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[FurnitureCategory] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    width: Optional[float] = Field(default=None, ge=0)
    height: Optional[float] = Field(default=None, ge=0)
    depth: Optional[float] = Field(default=None, ge=0)
    units: Optional[LengthUnit] = None
    source_type: Optional[FurnitureSource] = None
    reconstruction_method: Optional[FurnitureReconMethod] = None
    reconstruction_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    dimensions_confirmed: Optional[bool] = None
    model_path: Optional[str] = None
    materials: Optional[dict] = None
    textures: Optional[dict] = None


class FurnitureAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str
    description: str
    image_refs: list[str] = Field(default_factory=list)
    model_path: Optional[str] = None
    width: float
    height: float
    depth: float
    units: str
    pivot_x: float
    pivot_y: float
    pivot_z: float
    bbox_min_x: Optional[float] = None
    bbox_min_y: Optional[float] = None
    bbox_min_z: Optional[float] = None
    bbox_max_x: Optional[float] = None
    bbox_max_y: Optional[float] = None
    bbox_max_z: Optional[float] = None
    materials: dict = Field(default_factory=dict)
    textures: dict = Field(default_factory=dict)
    reconstruction_method: str
    reconstruction_confidence: Optional[float] = None
    dimensions_confirmed: bool = False
    source_type: str
    created_at: datetime
    updated_at: datetime


class FurnitureInstanceCreate(BaseModel):
    asset_id: int
    project_id: int
    floor_id: str = "floor-0"
    room_id: Optional[str] = None
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0
    rot_x: float = 0.0
    rot_y: float = 0.0
    rot_z: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0
    scale_z: float = 1.0
    material_overrides: Optional[dict] = None


class FurnitureInstanceUpdate(BaseModel):
    floor_id: Optional[str] = None
    room_id: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    pos_z: Optional[float] = None
    rot_x: Optional[float] = None
    rot_y: Optional[float] = None
    rot_z: Optional[float] = None
    scale_x: Optional[float] = None
    scale_y: Optional[float] = None
    scale_z: Optional[float] = None
    material_overrides: Optional[dict] = None


class FurnitureInstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_id: int
    project_id: int
    floor_id: str
    room_id: Optional[str] = None
    pos_x: float
    pos_y: float
    pos_z: float
    rot_x: float
    rot_y: float
    rot_z: float
    scale_x: float
    scale_y: float
    scale_z: float
    material_overrides: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class SceneConfigurationCreate(BaseModel):
    project_id: int
    name: str = Field(min_length=1, max_length=120)
    placements: list[dict] = Field(default_factory=list)


class SceneConfigurationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    placements: Optional[list[dict]] = None


class SceneConfigurationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    name: str
    placements: list[dict] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

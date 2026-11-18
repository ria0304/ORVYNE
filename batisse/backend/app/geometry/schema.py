"""Structured floor-plan geometry format (version 1).

Plan-plane quantities (polygon points, wall endpoints, wall thickness, opening
position and width) follow ``units``:
  * ``"px"`` - raw image pixels (scale not yet known; 3D generation is blocked)
  * ``"m"``  - real-world meters (scale known)

Vertical quantities (wall height, opening height, sill height, slab thickness,
elevation) are ALWAYS meters. They are user-adjustable parameters and are never
claimed to be extracted from the plan unless a source says so.

Plan +y maps to 3D +z in the viewer; plan +x maps to 3D +x. Up is +y in 3D.
Walls are centered on their plan line.
"""
from __future__ import annotations

import math
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Point = tuple[float, float]

ScaleSource = Literal["unknown", "user_reference", "ocr_dimension", "vector", "manual"]
Provenance = Literal["manual", "detected", "derived"]
OpeningType = Literal["door", "window"]
RoomType = Literal[
    "living", "bedroom", "kitchen", "bathroom", "dining", "hallway",
    "balcony", "utility", "storage", "other",
]


def _finite(p: Point) -> Point:
    if not (math.isfinite(p[0]) and math.isfinite(p[1])):
        raise ValueError("coordinates must be finite numbers")
    return (float(p[0]), float(p[1]))


class Scale(BaseModel):
    """Real-world scale of the source image.

    ``meters_per_pixel`` relates the *underlay image* to meters (used to align the
    plan image beneath metric geometry). It is None when unknown, and also for
    manual projects that have no underlay image.
    """

    meters_per_pixel: Optional[float] = Field(default=None, gt=0)
    source: ScaleSource = "unknown"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    note: Optional[str] = None

    @model_validator(mode="after")
    def _check(self) -> "Scale":
        if self.source == "unknown" and self.meters_per_pixel is not None:
            raise ValueError("scale source cannot be 'unknown' when meters_per_pixel is set")
        return self


class Room(BaseModel):
    id: str
    name: str = "Room"
    room_type: RoomType = "other"
    polygon: list[Point] = Field(min_length=3)
    source: Provenance = "manual"
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    label_text: Optional[str] = None  # raw OCR text, if any
    color: Optional[str] = None  # hex color override for floor surface
    # Derived
    area: float = 0.0  # in (plan units)^2
    width: float = 0.0  # bounding box, plan units
    depth: float = 0.0

    @field_validator("polygon")
    @classmethod
    def _poly(cls, v: list[Point]) -> list[Point]:
        return [_finite(p) for p in v]


class Wall(BaseModel):
    id: str
    start: Point
    end: Point
    thickness: float = Field(gt=0)  # plan units
    height: float = Field(gt=0)  # meters
    exterior: bool = False
    color: Optional[str] = None  # hex color override
    room_ids: list[str] = Field(default_factory=list)
    source: Provenance = "derived"
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    length: float = 0.0  # derived

    @field_validator("start", "end")
    @classmethod
    def _pt(cls, v: Point) -> Point:
        return _finite(v)


class Opening(BaseModel):
    """A door or window. ``position`` is its center in plan coordinates; the host
    wall is resolved by snapping to the nearest wall (``wall_id`` / ``offset`` are
    filled in by the geometry builder)."""

    id: str
    type: OpeningType
    position: Point
    width: float = Field(gt=0)  # plan units
    height: float = Field(gt=0)  # meters
    sill_height: float = Field(default=0.0, ge=0.0)  # meters
    source: Provenance = "manual"
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    needs_review: bool = False
    wall_id: Optional[str] = None
    offset: Optional[float] = None  # distance along host wall from its start

    @field_validator("position")
    @classmethod
    def _pt(cls, v: Point) -> Point:
        return _finite(v)


class Floor(BaseModel):
    id: str = "floor-0"
    name: str = "Ground floor"
    level: int = 0
    elevation: float = 0.0  # meters
    wall_height: float = Field(default=2.7, gt=0)  # meters; a default ASSUMPTION unless user-set
    wall_thickness: float = Field(default=0.15, gt=0)  # plan units
    slab_thickness: float = Field(default=0.15, gt=0)  # meters
    rooms: list[Room] = Field(default_factory=list)
    walls: list[Wall] = Field(default_factory=list)
    openings: list[Opening] = Field(default_factory=list)
    footprint: list[list[Point]] = Field(default_factory=list)  # derived outer rings


class Issue(BaseModel):
    severity: Literal["error", "warning", "info"]
    code: str
    message: str
    ref: Optional[str] = None


class FloorPlanGeometry(BaseModel):
    version: int = 1
    units: Literal["px", "m"] = "m"
    scale: Scale = Field(default_factory=Scale)
    # Underlay image size in pixels (processed image used for detection), if any.
    image_size: Optional[tuple[int, int]] = None
    floors: list[Floor] = Field(default_factory=lambda: [Floor()])
    issues: list[Issue] = Field(default_factory=list)

    @model_validator(mode="after")
    def _units_scale(self) -> "FloorPlanGeometry":
        if self.units == "m" and self.scale.source == "unknown":
            raise ValueError("geometry in meters requires a known scale source")
        if self.units == "px" and self.scale.source != "unknown":
            raise ValueError("geometry in pixels must have an unknown scale; apply the scale to convert to meters")
        return self

    @property
    def is_metric(self) -> bool:
        return self.units == "m"

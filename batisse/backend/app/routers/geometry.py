from __future__ import annotations

import math

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..errors import ApiError
from ..geometry import FloorPlanGeometry
from ..geometry.builder import apply_scale, rebuild
from ..schemas import UNIT_TO_M, GeometryRebuildRequest, GeometryResponse, ScaleAccept, ScaleReference
from ..services.projects import get_project_or_404, load_geometry, ready_for_3d, save_geometry
from ..models import ProcessingRun
from sqlalchemy import select

router = APIRouter(tags=["geometry"])

MAX_ROOMS = 500
MAX_VERTICES = 20_000


def _guard(g: FloorPlanGeometry) -> None:
    rooms = sum(len(f.rooms) for f in g.floors)
    verts = sum(len(r.polygon) for f in g.floors for r in f.rooms)
    if rooms > MAX_ROOMS or verts > MAX_VERTICES:
        raise ApiError(422, "geometry_too_large", f"Geometry is too large (max {MAX_ROOMS} rooms / {MAX_VERTICES} vertices).")


def _response(db: Session, project, g: FloorPlanGeometry) -> GeometryResponse:
    has_img = db.scalars(select(ProcessingRun.id).where(ProcessingRun.project_id == project.id).limit(1)).first() is not None
    return GeometryResponse(geometry=g, revision=project.geometry_revision or 0, ready_for_3d=ready_for_3d(g), has_plan_image=has_img)


@router.post("/geometry/rebuild", response_model=FloorPlanGeometry)
def rebuild_geometry(body: GeometryRebuildRequest):
    """Stateless: recompute derived walls/footprint/issues for edited rooms and openings."""
    _guard(body.geometry)
    return rebuild(body.geometry)


@router.get("/projects/{project_id}/geometry", response_model=GeometryResponse)
def get_geometry(project_id: int, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    return _response(db, project, rebuild(load_geometry(project)))


@router.put("/projects/{project_id}/geometry", response_model=GeometryResponse)
def put_geometry(project_id: int, body: GeometryRebuildRequest, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    _guard(body.geometry)
    errors = [i for i in rebuild(body.geometry).issues if i.severity == "error"]
    if errors:
        raise ApiError(422, "invalid_geometry", errors[0].message, [e.model_dump() for e in errors])
    g = save_geometry(db, project, body.geometry)
    return _response(db, project, g)


@router.post("/projects/{project_id}/geometry/scale/reference", response_model=GeometryResponse)
def scale_from_reference(project_id: int, body: ScaleReference, db: Session = Depends(get_db)):
    """User-provided scale: two points in the current plan coordinates + the real length between them."""
    project = get_project_or_404(db, project_id)
    g = load_geometry(project)
    d = math.dist(body.p1, body.p2)
    if d <= 1e-9:
        raise ApiError(422, "degenerate_reference", "The two reference points are identical; pick two different points.")
    real_m = body.length * UNIT_TO_M[body.unit]
    if not 0.05 <= real_m <= 200:
        raise ApiError(422, "implausible_reference", "The reference length must be between 5 cm and 200 m.")
    note = f"Reference of {body.length:g} {body.unit} entered by the user."
    if g.units == "px":
        out = apply_scale(g, meters_per_pixel=real_m / d, source="user_reference", confidence=0.9, note=note)
    else:
        out = apply_scale(g, scale_factor=real_m / d, source="user_reference", confidence=0.9, note=note)
    return _response(db, project, save_geometry(db, project, out))


@router.post("/projects/{project_id}/geometry/scale/accept", response_model=GeometryResponse)
def scale_accept(project_id: int, body: ScaleAccept, db: Session = Depends(get_db)):
    """Accept a proposed or explicitly typed meters-per-pixel scale (pixel geometry only)."""
    project = get_project_or_404(db, project_id)
    g = load_geometry(project)
    if g.units != "px":
        raise ApiError(409, "already_metric", "This geometry already has a scale. Use a scale reference to correct it.")
    out = apply_scale(g, meters_per_pixel=body.meters_per_pixel, source=body.source, confidence=body.confidence, note=body.note)
    return _response(db, project, save_geometry(db, project, out))

"""Project/geometry persistence helpers shared by routers."""
from __future__ import annotations

import shutil

from sqlalchemy.orm import Session

from .. import config
from ..errors import ApiError
from ..geometry import FloorPlanGeometry, Scale
from ..geometry.builder import rebuild
from ..models import Project
from ..schemas import ProjectOut


def get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise ApiError(404, "project_not_found", f"Project {project_id} does not exist.")
    return project


def blank_geometry() -> FloorPlanGeometry:
    return FloorPlanGeometry(units="m", scale=Scale(source="manual", confidence=1.0, note="User-entered dimensions."))


def load_geometry(project: Project) -> FloorPlanGeometry:
    if not project.geometry_json:
        return blank_geometry()
    return FloorPlanGeometry.model_validate_json(project.geometry_json)


def save_geometry(db: Session, project: Project, geometry: FloorPlanGeometry) -> FloorPlanGeometry:
    rebuilt = rebuild(geometry)
    project.geometry_json = rebuilt.model_dump_json()
    project.geometry_revision = (project.geometry_revision or 0) + 1
    db.commit()
    db.refresh(project)
    return rebuilt


def ready_for_3d(g: FloorPlanGeometry) -> bool:
    if g.units != "m":
        return False
    if any(i.severity == "error" for i in g.issues):
        return False
    return any(f.walls for f in g.floors)


def project_out(project: Project) -> ProjectOut:
    g = load_geometry(project) if project.geometry_json else None
    return ProjectOut(
        id=project.id, name=project.name, description=project.description,
        created_at=project.created_at, updated_at=project.updated_at,
        upload_count=len(project.uploads),
        room_count=sum(len(f.rooms) for f in g.floors) if g else 0,
        has_geometry=bool(g and any(f.rooms for f in g.floors)),
        units=g.units if g else None,
        ready_for_3d=bool(g and ready_for_3d(g)),
    )


def delete_project_files(project_id: int) -> None:
    shutil.rmtree(config.UPLOAD_DIR / str(project_id), ignore_errors=True)
    shutil.rmtree(config.PLAN_DIR / str(project_id), ignore_errors=True)

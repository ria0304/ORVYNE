from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..errors import ApiError
from ..models import ProcessingRun
from ..processing.loader import load_page
from ..processing.pipeline import ProcessingReport, process_page
from ..schemas import ProcessRequest, ProcessResponse
from ..services.projects import get_project_or_404, load_geometry, save_geometry
from .uploads import get_upload_or_404, upload_path

router = APIRouter(prefix="/projects/{project_id}", tags=["processing"])


def _latest_run(db: Session, project_id: int) -> ProcessingRun | None:
    return db.scalars(
        select(ProcessingRun).where(ProcessingRun.project_id == project_id).order_by(ProcessingRun.id.desc()).limit(1)
    ).first()


@router.post("/process", response_model=ProcessResponse)
def process_upload(project_id: int, body: ProcessRequest, db: Session = Depends(get_db)):
    """Run the detection pipeline on one page of an uploaded plan. The result is a DRAFT
    for the user to review; it is stored as the project's geometry."""
    project = get_project_or_404(db, project_id)
    upload = get_upload_or_404(db, body.upload_id)
    if upload.project_id != project_id:
        raise ApiError(404, "upload_not_found", "That upload does not belong to this project.")
    if body.page_index >= upload.page_count:
        raise ApiError(422, "page_out_of_range", f"Page {body.page_index + 1} does not exist; the file has {upload.page_count} page(s).")
    existing = load_geometry(project)
    if any(f.rooms for f in existing.floors) and not body.replace_existing:
        raise ApiError(409, "geometry_exists", "This project already has geometry. Confirm replacing it to run detection again.")

    loaded = load_page(upload_path(upload), upload.kind, body.page_index)  # type: ignore[arg-type]
    out = process_page(loaded)

    plan_dir = config.PLAN_DIR / str(project_id)
    plan_dir.mkdir(parents=True, exist_ok=True)
    plan_name = f"{uuid.uuid4().hex}.png"
    (plan_dir / plan_name).write_bytes(out.plan_png)
    run = ProcessingRun(project_id=project_id, upload_id=upload.id, page_index=body.page_index,
                        report_json=out.report.model_dump_json(), plan_image_name=plan_name)
    db.add(run)
    geometry = save_geometry(db, project, out.geometry)
    db.refresh(run)
    return ProcessResponse(run_id=run.id, geometry=geometry, report=out.report)


@router.get("/processing", response_model=ProcessingReport | None)
def latest_report(project_id: int, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    run = _latest_run(db, project_id)
    return ProcessingReport.model_validate(json.loads(run.report_json)) if run else None


@router.get("/plan-image")
def plan_image(project_id: int, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    run = _latest_run(db, project_id)
    if run is None:
        raise ApiError(404, "no_plan_image", "No processed plan image exists for this project yet.")
    path = config.PLAN_DIR / str(project_id) / run.plan_image_name
    if not path.exists():
        raise ApiError(404, "no_plan_image", "The processed plan image is missing.")
    return Response(content=path.read_bytes(), media_type="image/png", headers={"Cache-Control": f"private, max-age=3600, immutable", "ETag": run.plan_image_name})

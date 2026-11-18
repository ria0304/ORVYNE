from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..errors import ApiError
from ..models import Upload
from ..processing.loader import InputError, inspect_file, render_preview_png, sniff_kind
from ..schemas import UploadOut
from ..services.projects import get_project_or_404

router = APIRouter(tags=["uploads"])


def upload_path(upload: Upload) -> Path:
    return config.UPLOAD_DIR / str(upload.project_id) / upload.stored_name


def get_upload_or_404(db: Session, upload_id: int) -> Upload:
    up = db.get(Upload, upload_id)
    if up is None:
        raise ApiError(404, "upload_not_found", f"Upload {upload_id} does not exist.")
    return up


@router.post("/projects/{project_id}/uploads", response_model=UploadOut, status_code=201)
async def upload_plan(project_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        raise ApiError(415, "unsupported_type", f"Unsupported file type '{ext or 'unknown'}'. Upload a JPG, JPEG, PNG or PDF.")

    dest_dir = config.UPLOAD_DIR / str(project_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    dest = dest_dir / stored
    size, head = 0, b""
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                if not head:
                    head = chunk[:16]
                size += len(chunk)
                if size > config.MAX_UPLOAD_BYTES:
                    raise ApiError(413, "file_too_large", f"File exceeds the {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")
                out.write(chunk)
        if size == 0:
            raise ApiError(422, "empty_file", "The uploaded file is empty.")
        kind = sniff_kind(head)
        if kind is None:
            raise ApiError(415, "unrecognised_content", "The file content is not a valid JPG, PNG or PDF.")
        if kind != config.ALLOWED_EXTENSIONS[ext]:
            raise ApiError(415, "extension_mismatch", f"The file extension '{ext}' does not match its actual content ({kind.upper()}).")
        try:
            info = inspect_file(dest, kind)
        except InputError as exc:
            raise ApiError(422, "invalid_input", str(exc)) from exc
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    up = Upload(project_id=project_id, original_name=original, stored_name=stored, kind=kind, size_bytes=size,
                page_count=info.page_count, width=info.width, height=info.height)
    db.add(up)
    db.commit()
    db.refresh(up)
    return up


@router.get("/projects/{project_id}/uploads", response_model=list[UploadOut])
def list_uploads(project_id: int, db: Session = Depends(get_db)):
    return get_project_or_404(db, project_id).uploads


@router.get("/uploads/{upload_id}/preview")
def upload_preview(upload_id: int, page: int = Query(0, ge=0), db: Session = Depends(get_db)):
    up = get_upload_or_404(db, upload_id)
    if page >= up.page_count:
        raise ApiError(422, "page_out_of_range", f"Page {page + 1} does not exist; the file has {up.page_count} page(s).")
    png = render_preview_png(upload_path(up), up.kind, page)  # type: ignore[arg-type]
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, max-age=300"})


@router.delete("/uploads/{upload_id}", status_code=204)
def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    up = get_upload_or_404(db, upload_id)
    path = upload_path(up)
    db.delete(up)
    db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)

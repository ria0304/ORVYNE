from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..errors import ApiError
from ..models import FurnitureAsset, FurnitureInstance, Project, SceneConfiguration
from ..schemas import (
    FurnitureAssetCreate, FurnitureAssetOut, FurnitureAssetUpdate,
    FurnitureInstanceCreate, FurnitureInstanceOut, FurnitureInstanceUpdate,
    SceneConfigurationCreate, SceneConfigurationOut, SceneConfigurationUpdate,
)
from .projects import get_project_or_404

router = APIRouter(tags=["furniture"])


def _asset_out(a: FurnitureAsset) -> FurnitureAssetOut:
    return FurnitureAssetOut(
        id=a.id, name=a.name, category=a.category, description=a.description,
        image_refs=json.loads(a.image_refs or "[]"),
        model_path=a.model_path, width=a.width, height=a.height, depth=a.depth,
        units=a.units, pivot_x=a.pivot_x, pivot_y=a.pivot_y, pivot_z=a.pivot_z,
        bbox_min_x=a.bbox_min_x, bbox_min_y=a.bbox_min_y, bbox_min_z=a.bbox_min_z,
        bbox_max_x=a.bbox_max_x, bbox_max_y=a.bbox_max_y, bbox_max_z=a.bbox_max_z,
        materials=json.loads(a.materials or "{}"),
        textures=json.loads(a.textures or "{}"),
        reconstruction_method=a.reconstruction_method,
        reconstruction_confidence=a.reconstruction_confidence,
        dimensions_confirmed=a.dimensions_confirmed,
        source_type=a.source_type, created_at=a.created_at, updated_at=a.updated_at,
    )


def _instance_out(i: FurnitureInstance) -> FurnitureInstanceOut:
    return FurnitureInstanceOut(
        id=i.id, asset_id=i.asset_id, project_id=i.project_id, floor_id=i.floor_id,
        room_id=i.room_id, pos_x=i.pos_x, pos_y=i.pos_y, pos_z=i.pos_z,
        rot_x=i.rot_x, rot_y=i.rot_y, rot_z=i.rot_z,
        scale_x=i.scale_x, scale_y=i.scale_y, scale_z=i.scale_z,
        material_overrides=json.loads(i.material_overrides) if i.material_overrides else None,
        created_at=i.created_at, updated_at=i.updated_at,
    )


def _scene_out(s: SceneConfiguration) -> SceneConfigurationOut:
    return SceneConfigurationOut(
        id=s.id, project_id=s.project_id, name=s.name,
        placements=json.loads(s.placements_json or "[]"),
        created_at=s.created_at, updated_at=s.updated_at,
    )


# ---- Model import & serving ----

ALLOWED_MODEL_EXT = {".glb", ".gltf"}
MODEL_MEDIA = {".glb": "model/gltf-binary", ".gltf": "model/gltf+json"}


def _asset_dir(asset_id: int) -> Path:
    return config.ASSET_DIR / str(asset_id)


def _is_self_contained_gltf(path: Path) -> bool:
    """Reject .gltf files that reference external buffers/images."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    # Walk top-level buffers/images for uri fields pointing to non-data URIs.
    for key in ("buffers", "images"):
        for item in data.get(key, []) or []:
            uri = item.get("uri") if isinstance(item, dict) else None
            if isinstance(uri, str) and not uri.startswith("data:"):
                return False
    return True


@router.post("/furniture/assets/import", response_model=FurnitureAssetOut, status_code=201)
async def import_asset(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    category: str = Form(default="other"),
    db: Session = Depends(get_db),
):
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_MODEL_EXT:
        raise ApiError(415, "unsupported_type", f"Unsupported model type '{ext or 'unknown'}'. Upload a .glb or .gltf file.")

    dest_dir_tmp = config.ASSET_DIR / "_incoming"
    dest_dir_tmp.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    dest = dest_dir_tmp / stored
    size = 0
    head = b""
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
        # GLB magic check
        if ext == ".glb":
            if not head.startswith(b"glTF"):
                raise ApiError(415, "invalid_model", "The file is not a valid GLB (missing glTF header).")
        else:
            # .gltf must be JSON
            try:
                json.loads(dest.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                raise ApiError(415, "invalid_model", "The .gltf file is not valid JSON.")
            if not _is_self_contained_gltf(dest):
                raise ApiError(422, "external_dependencies",
                              "This .gltf references external buffers or images. Export a self-contained .glb or embed all resources as data URIs.")
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    asset_name = (name or Path(original).stem or "Imported furniture").strip() or "Imported furniture"
    if category not in {
        "sofa", "bed", "chair", "table", "wardrobe", "cabinet", "shelf", "desk", "dresser",
        "lighting", "decor", "other",
    }:
        category = "other"

    asset = FurnitureAsset(
        name=asset_name, category=category, description="",
        source_type="imported_model", reconstruction_method="imported",
        reconstruction_confidence=None, dimensions_confirmed=False,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    # Move file into asset dir
    asset_dir = _asset_dir(asset.id)
    asset_dir.mkdir(parents=True, exist_ok=True)
    final = asset_dir / f"{uuid.uuid4().hex}{ext}"
    shutil.move(str(dest), str(final))
    asset.model_path = str(final.relative_to(config.DATA_DIR)) if final.is_relative_to(config.DATA_DIR) else str(final)
    # store as path relative to ASSET_DIR for serving; keep relative-to-DATA for consistency with config
    asset.model_path = str(final.relative_to(config.ASSET_DIR)) if final.is_relative_to(config.ASSET_DIR) else str(final)
    db.commit()
    db.refresh(asset)
    return _asset_out(asset)


@router.get("/furniture/assets/{asset_id}/model")
def serve_model(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(FurnitureAsset, asset_id)
    if asset is None or not asset.model_path:
        raise ApiError(404, "model_not_found", f"No model file for furniture asset {asset_id}.")
    path = (config.ASSET_DIR / asset.model_path).resolve()
    # prevent path traversal
    if not path.is_file() or config.ASSET_DIR.resolve() not in path.parents:
        raise ApiError(404, "model_not_found", f"Model file for furniture asset {asset_id} is missing.")
    ext = path.suffix.lower()
    media = MODEL_MEDIA.get(ext, "application/octet-stream")
    return FileResponse(path, media_type=media, filename=path.name)


# ---- Assets ----

@router.post("/furniture/assets", response_model=FurnitureAssetOut, status_code=201)
def create_asset(body: FurnitureAssetCreate, db: Session = Depends(get_db)):
    a = FurnitureAsset(
        name=body.name, category=body.category, description=body.description,
        width=body.width, height=body.height, depth=body.depth, units=body.units,
        source_type=body.source_type, reconstruction_method=body.reconstruction_method,
        reconstruction_confidence=body.reconstruction_confidence,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _asset_out(a)


@router.get("/furniture/assets", response_model=list[FurnitureAssetOut])
def list_assets(db: Session = Depends(get_db)):
    assets = db.scalars(select(FurnitureAsset).order_by(FurnitureAsset.updated_at.desc())).all()
    return [_asset_out(a) for a in assets]


@router.get("/furniture/assets/{asset_id}", response_model=FurnitureAssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    a = db.get(FurnitureAsset, asset_id)
    if a is None:
        raise ApiError(404, "asset_not_found", f"Furniture asset {asset_id} does not exist.")
    return _asset_out(a)


@router.patch("/furniture/assets/{asset_id}", response_model=FurnitureAssetOut)
def update_asset(asset_id: int, body: FurnitureAssetUpdate, db: Session = Depends(get_db)):
    a = db.get(FurnitureAsset, asset_id)
    if a is None:
        raise ApiError(404, "asset_not_found", f"Furniture asset {asset_id} does not exist.")
    if body.name is not None:
        a.name = body.name
    if body.category is not None:
        a.category = body.category
    if body.description is not None:
        a.description = body.description
    if body.width is not None:
        a.width = body.width
    if body.height is not None:
        a.height = body.height
    if body.depth is not None:
        a.depth = body.depth
    if body.units is not None:
        a.units = body.units
    if body.source_type is not None:
        a.source_type = body.source_type
    if body.reconstruction_method is not None:
        a.reconstruction_method = body.reconstruction_method
    if body.reconstruction_confidence is not None:
        a.reconstruction_confidence = body.reconstruction_confidence
    if body.dimensions_confirmed is not None:
        a.dimensions_confirmed = body.dimensions_confirmed
    if body.model_path is not None:
        a.model_path = body.model_path
    if body.materials is not None:
        a.materials = json.dumps(body.materials)
    if body.textures is not None:
        a.textures = json.dumps(body.textures)
    db.commit()
    db.refresh(a)
    return _asset_out(a)


@router.delete("/furniture/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    a = db.get(FurnitureAsset, asset_id)
    if a is None:
        raise ApiError(404, "asset_not_found", f"Furniture asset {asset_id} does not exist.")
    db.delete(a)
    db.commit()
    # clean up stored model files
    shutil.rmtree(config.ASSET_DIR / str(asset_id), ignore_errors=True)
    return None


# ---- Instances ----

@router.post("/furniture/instances", response_model=FurnitureInstanceOut, status_code=201)
def create_instance(body: FurnitureInstanceCreate, db: Session = Depends(get_db)):
    project = db.get(Project, body.project_id)
    if project is None:
        raise ApiError(404, "project_not_found", f"Project {body.project_id} does not exist.")
    asset = db.get(FurnitureAsset, body.asset_id)
    if asset is None:
        raise ApiError(404, "asset_not_found", f"Furniture asset {body.asset_id} does not exist.")
    inst = FurnitureInstance(
        asset_id=body.asset_id, project_id=body.project_id, floor_id=body.floor_id,
        room_id=body.room_id, pos_x=body.pos_x, pos_y=body.pos_y, pos_z=body.pos_z,
        rot_x=body.rot_x, rot_y=body.rot_y, rot_z=body.rot_z,
        scale_x=body.scale_x, scale_y=body.scale_y, scale_z=body.scale_z,
        material_overrides=json.dumps(body.material_overrides) if body.material_overrides else None,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return _instance_out(inst)


@router.get("/projects/{project_id}/furniture/instances", response_model=list[FurnitureInstanceOut])
def list_instances(project_id: int, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    insts = db.scalars(select(FurnitureInstance).where(FurnitureInstance.project_id == project_id)).all()
    return [_instance_out(i) for i in insts]


@router.get("/furniture/instances/{instance_id}", response_model=FurnitureInstanceOut)
def get_instance(instance_id: int, db: Session = Depends(get_db)):
    i = db.get(FurnitureInstance, instance_id)
    if i is None:
        raise ApiError(404, "instance_not_found", f"Furniture instance {instance_id} does not exist.")
    return _instance_out(i)


@router.patch("/furniture/instances/{instance_id}", response_model=FurnitureInstanceOut)
def update_instance(instance_id: int, body: FurnitureInstanceUpdate, db: Session = Depends(get_db)):
    i = db.get(FurnitureInstance, instance_id)
    if i is None:
        raise ApiError(404, "instance_not_found", f"Furniture instance {instance_id} does not exist.")
    if body.floor_id is not None:
        i.floor_id = body.floor_id
    if body.room_id is not None:
        i.room_id = body.room_id
    if body.pos_x is not None:
        i.pos_x = body.pos_x
    if body.pos_y is not None:
        i.pos_y = body.pos_y
    if body.pos_z is not None:
        i.pos_z = body.pos_z
    if body.rot_x is not None:
        i.rot_x = body.rot_x
    if body.rot_y is not None:
        i.rot_y = body.rot_y
    if body.rot_z is not None:
        i.rot_z = body.rot_z
    if body.scale_x is not None:
        i.scale_x = body.scale_x
    if body.scale_y is not None:
        i.scale_y = body.scale_y
    if body.scale_z is not None:
        i.scale_z = body.scale_z
    if body.material_overrides is not None:
        i.material_overrides = json.dumps(body.material_overrides)
    db.commit()
    db.refresh(i)
    return _instance_out(i)


@router.delete("/furniture/instances/{instance_id}", status_code=204)
def delete_instance(instance_id: int, db: Session = Depends(get_db)):
    i = db.get(FurnitureInstance, instance_id)
    if i is None:
        raise ApiError(404, "instance_not_found", f"Furniture instance {instance_id} does not exist.")
    db.delete(i)
    db.commit()
    return None


# ---- Scene configurations ----

@router.post("/scene-configurations", response_model=SceneConfigurationOut, status_code=201)
def create_scene(body: SceneConfigurationCreate, db: Session = Depends(get_db)):
    project = db.get(Project, body.project_id)
    if project is None:
        raise ApiError(404, "project_not_found", f"Project {body.project_id} does not exist.")
    s = SceneConfiguration(project_id=body.project_id, name=body.name, placements_json=json.dumps(body.placements))
    db.add(s)
    db.commit()
    db.refresh(s)
    return _scene_out(s)


@router.get("/projects/{project_id}/scene-configurations", response_model=list[SceneConfigurationOut])
def list_scenes(project_id: int, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    scenes = db.scalars(select(SceneConfiguration).where(SceneConfiguration.project_id == project_id)).all()
    return [_scene_out(s) for s in scenes]


@router.get("/scene-configurations/{scene_id}", response_model=SceneConfigurationOut)
def get_scene(scene_id: int, db: Session = Depends(get_db)):
    s = db.get(SceneConfiguration, scene_id)
    if s is None:
        raise ApiError(404, "scene_not_found", f"Scene configuration {scene_id} does not exist.")
    return _scene_out(s)


@router.patch("/scene-configurations/{scene_id}", response_model=SceneConfigurationOut)
def update_scene(scene_id: int, body: SceneConfigurationUpdate, db: Session = Depends(get_db)):
    s = db.get(SceneConfiguration, scene_id)
    if s is None:
        raise ApiError(404, "scene_not_found", f"Scene configuration {scene_id} does not exist.")
    if body.name is not None:
        s.name = body.name
    if body.placements is not None:
        s.placements_json = json.dumps(body.placements)
    db.commit()
    db.refresh(s)
    return _scene_out(s)


@router.post("/scene-configurations/{scene_id}/duplicate", response_model=SceneConfigurationOut, status_code=201)
def duplicate_scene(scene_id: int, db: Session = Depends(get_db)):
    s = db.get(SceneConfiguration, scene_id)
    if s is None:
        raise ApiError(404, "scene_not_found", f"Scene configuration {scene_id} does not exist.")
    dup = SceneConfiguration(project_id=s.project_id, name=f"{s.name} (copy)", placements_json=s.placements_json)
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return _scene_out(dup)


@router.delete("/scene-configurations/{scene_id}", status_code=204)
def delete_scene(scene_id: int, db: Session = Depends(get_db)):
    s = db.get(SceneConfiguration, scene_id)
    if s is None:
        raise ApiError(404, "scene_not_found", f"Scene configuration {scene_id} does not exist.")
    db.delete(s)
    db.commit()
    return None
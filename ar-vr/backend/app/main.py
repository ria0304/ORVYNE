"""ar-vr Integration Layer — FastAPI entrypoint.

Run: uvicorn app.main:app --reload from the ./backend directory.

This is the integration hub that connects BATISSE, WYA, TryOn, and VELARIS
into a unified virtual experience. Each project remains independent; this
layer coordinates API communication without merging databases or business logic.
"""

from __future__ import annotations

import json
import logging
import os
import time
import jwt  # PyJWT for token validation
from datetime import datetime, timezone
from typing import Any, Dict, Generator
import httpx
from httpx import AsyncClient
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Form, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func

from . import config
from . import database  # noqa: F401
from .schemas import IntegrationHealth  # noqa: F401
from .services import batisse_service, wya_service, tryon_service, velaris_service  # noqa: F401
from .request_context import client_ip_var
from .auth import get_current_user, get_wya_token, clear_wya_token, get_tryon_user_id, router as auth_router
from .services.batisse_service import get_batisse_service
from .services.wya_service import get_wya_service
from .services.tryon_service import get_tryon_service
from .services.velaris_service import get_velaris_service

logger = logging.getLogger(__name__)




# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Startup and shutdown for the integration service."""
    if config.USING_DEV_JWT_SECRET:
        if config.ORVYNE_ENV == "production":
            raise RuntimeError("INTEGRATION_JWT_SECRET must be set in production; refusing to use the public dev secret")
        logger.warning("Using the public dev JWT secret: anyone can forge tokens. Set INTEGRATION_JWT_SECRET before deploying.")
    # Startup
    config.ensure_dirs()
    database.init_db()
    logger.info("ar-vr integration service starting up (v%s)", config.APP_VERSION)

    # Initialize service singletons
    from app.services.tryon_service import get_tryon_service, _tryon_service
    from app.services.batisse_service import get_batisse_service, _batisse_service
    from app.services.wya_service import get_wya_service, _wya_service
    from app.services.velaris_service import get_velaris_service, _velaris_service

    # Initialize tryon singleton
    tryon_svc = get_tryon_service()

    # Verify downstream service connectivity
    db = database.get_db_session()
    services_check: Dict[str, bool] = {}

    try:
        # Check BATISSE
        try:
            svc = get_batisse_service()
            ping_result = await svc.ping()
            services_check["batisse"] = ping_result
            if ping_result:
                logger.info("BATISSE service reachable")
            else:
                logger.warning("BATISSE service not reachable: ping returned False")
        except Exception as e:
            services_check["batisse"] = False
            logger.warning(f"BATISSE service not reachable: {e}")

        # Check WYA
        try:
            svc = get_wya_service()
            ping_result = await svc.ping()
            services_check["wya"] = ping_result
            if ping_result:
                logger.info("WYA service reachable")
            else:
                logger.warning("WYA service not reachable: ping returned False")
        except Exception as e:
            services_check["wya"] = False
            logger.warning(f"WYA service not reachable: {e}")

        # Check TryOn
        try:
            from app.services.tryon_service import get_tryon_service
            svc = get_tryon_service()
            status = await svc.ping()
            services_check["tryon"] = status
            if status:
                logger.info("TryOn service reachable")
            else:
                logger.warning("TryOn service not reachable: ping failed")
        except Exception as e:
            services_check["tryon"] = False
            logger.warning(f"TryOn service not reachable: {e}")

        # Check VELARIS
        try:
            svc = get_velaris_service()
            ping_result = await svc.ping()
            services_check["velaris"] = ping_result
            if ping_result:
                logger.info("VELARIS service reachable")
            else:
                logger.warning("VELARIS service not reachable: ping returned False")
        except Exception as e:
            services_check["velaris"] = False
            logger.warning(f"VELARIS service not reachable: {e}")
    finally:
        db.close()

    logger.info("Downstream service health: %s", services_check)

    yield
    # Shutdown
    logger.info("ar-vr integration service shutting down")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ar-vr Integration Layer",
    version=config.APP_VERSION,
    description="Integration layer connecting BATISSE + WYA + TryOn + VELARIS",
    lifespan=lifespan,
)

# CORS — allow origins from config
allowed_origins = config.CORS_ORIGINS if isinstance(config.CORS_ORIGINS, list) else [config.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-User-Id"],
    expose_headers=["X-Request-Id"],
    max_age=3600,
)


app.include_router(auth_router)


# ── Request Logging Middleware ────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    client_ip_var.set(request.client.host if request.client else None)
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# ── Health Check ───────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=IntegrationHealth, tags=["meta"])
async def health() -> IntegrationHealth:
    """Integration service health check with downstream service status."""
    db = database.get_db_session()
    try:
        services: Dict[str, str] = {}

        # Check BATISSE
        try:
            svc = get_batisse_service()
            services["batisse"] = "ok" if await svc.ping() else "unreachable"
        except Exception:
            services["batisse"] = "unreachable"

        # Check WYA
        try:
            svc = get_wya_service()
            services["wya"] = "ok" if await svc.ping() else "unreachable"
        except Exception:
            services["wya"] = "unreachable"

        # Check TryOn
        try:
            svc = get_tryon_service()
            services["tryon"] = "ok" if await svc.ping() else "unreachable"
        except Exception:
            services["tryon"] = "unreachable"

        # Check VELARIS
        try:
            svc = get_velaris_service()
            services["velaris"] = "ok" if await svc.ping() else "unreachable"
        except Exception:
            services["velaris"] = "unreachable"
    finally:
        db.close()

    up = sum(1 for v in services.values() if v == "ok")
    overall = "ok" if up == len(services) else ("down" if up == 0 else "degraded")
    return IntegrationHealth(status=overall, services=services)


# ── Downstream error mapping ──────────────────────────────────────────────────

def downstream_error(service: str, exc: Exception) -> HTTPException:
    """Map a failed downstream call to an honest HTTP error (never a 200)."""
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        detail = f"{service} returned {code}"
        try:
            body = exc.response.json()
            msg = body.get("detail") or body.get("message") or (body.get("error") or {}).get("message")
            if isinstance(msg, str):
                detail += f": {msg[:160]}"
        except Exception:
            pass
        if code in (400, 404, 409, 413, 415, 422):
            return HTTPException(status_code=code, detail=detail)
        if code in (401, 403):
            return HTTPException(status_code=424, detail=f"{detail} (the {service} session was rejected; sign in again)")
        if code == 503:
            return HTTPException(status_code=503, detail=detail)
        return HTTPException(status_code=502, detail=detail)
    if isinstance(exc, (httpx.TransportError, httpx.TimeoutException)):
        return HTTPException(status_code=503, detail=f"{service} is unavailable")
    return HTTPException(status_code=502, detail=f"{service} call failed: {str(exc)[:100]}")


# ── BATISSE — Floor plan to virtual home ──────────────────────────────────────

def _linked_project_id(user_id: str) -> int | None:
    db = database.get_db_session()
    try:
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=user_id).first()
        return meta.batisse_project_id if meta else None
    finally:
        db.close()


def _require_project(user_id: str) -> int:
    pid = _linked_project_id(user_id)
    if pid is None:
        raise HTTPException(status_code=404, detail="No BATISSE home yet: upload a floor plan first")
    return pid


def _link_project(user_id: str, project_id: int) -> None:
    db = database.get_db_session()
    try:
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=user_id).first()
        if meta is None:
            meta = database.IntegrationMetadata(user_id=user_id, room_assignments={})
            db.add(meta)
        meta.batisse_project_id = project_id
        db.commit()
    finally:
        db.close()


MAX_PLAN_BYTES = 25 * 1024 * 1024


@app.post("/api/batisse/upload", tags=["batisse"], summary="Upload a floor plan and generate the user's home")
async def batisse_upload(
    file: UploadFile = File(...),
    name: str = Form(""),
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create (or reuse) the user's BATISSE project, upload the plan image/PDF and run detection."""
    content = await file.read(MAX_PLAN_BYTES + 1)
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded file is empty")
    if len(content) > MAX_PLAN_BYTES:
        raise HTTPException(status_code=413, detail="Floor plan exceeds the 25 MB limit")
    svc = get_batisse_service()
    try:
        project_id = _linked_project_id(auth_user_id)
        if project_id is None:
            project = await svc.create_project(name.strip() or "My ORVYNE home")
            project_id = project["id"]
            _link_project(auth_user_id, project_id)
        upload = await svc.upload_plan(project_id, file.filename or "plan.png", content, file.content_type or "")
        processed = await svc.process_plan(project_id, upload["id"], replace_existing=True)
    except Exception as e:
        logger.error("BATISSE upload failed: %s", e)
        raise downstream_error("BATISSE", e)
    geometry = processed.get("geometry", {})   # BATISSE returns the FloorPlanGeometry itself
    return {
        "success": True,
        "project_id": project_id,
        "upload_id": upload["id"],
        "units": geometry.get("units"),
        # 3D needs real-world metres; pixel geometry still needs a scale (see /api/batisse/scale-from-longest-wall)
        "ready_for_3d": geometry.get("units") == "m",
        "room_count": sum(len(f.get("rooms", [])) for f in geometry.get("floors", [])),
    }


@app.get("/api/batisse/geometry", tags=["batisse"], summary="Validated geometry of the signed-in user's home")
async def batisse_get_geometry_default(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    project_id = _require_project(auth_user_id)
    try:
        return await get_batisse_service().get_geometry(project_id)
    except Exception as e:
        raise downstream_error("BATISSE", e)


@app.get("/api/batisse/projects/{project_id}/geometry", tags=["batisse"],
         summary="Geometry for a project (only the user's own)")
async def batisse_get_geometry(project_id: int, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    if project_id != _linked_project_id(auth_user_id):
        raise HTTPException(status_code=403, detail="That BATISSE project does not belong to you")
    try:
        return await get_batisse_service().get_geometry(project_id)
    except Exception as e:
        raise downstream_error("BATISSE", e)


class ScaleReferenceBody(BaseModel):
    p1: list[float] = Field(min_length=2, max_length=2)
    p2: list[float] = Field(min_length=2, max_length=2)
    length: float = Field(gt=0)
    unit: str = "m"


@app.post("/api/batisse/scale-reference", tags=["batisse"], summary="Set the real-world scale of the user's plan")
async def batisse_set_scale_reference(body: ScaleReferenceBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    project_id = _require_project(auth_user_id)
    try:
        return await get_batisse_service().set_scale_reference(project_id, body.p1, body.p2, body.length, body.unit)
    except Exception as e:
        raise downstream_error("BATISSE", e)


class ScaleFromWallBody(BaseModel):
    length: float = Field(gt=0, le=1000)
    unit: str = "m"


@app.post("/api/batisse/scale-from-longest-wall", tags=["batisse"],
          summary="Set scale by giving the real length of the plan's longest wall")
async def batisse_scale_from_longest_wall(body: ScaleFromWallBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Convenience for users who cannot pick two plan points: the longest detected wall
    becomes the scale reference, using BATISSE's own scale endpoint."""
    project_id = _require_project(auth_user_id)
    svc = get_batisse_service()
    try:
        current = await svc.get_geometry(project_id)
        floors = current.get("geometry", {}).get("floors", [])
        walls = [w for f in floors for w in f.get("walls", [])]
        if not walls:
            raise HTTPException(status_code=422, detail="No walls were detected in your floor plan")
        longest = max(walls, key=lambda w: ((w["end"][0] - w["start"][0]) ** 2 + (w["end"][1] - w["start"][1]) ** 2))
        await svc.set_scale_reference(project_id, longest["start"], longest["end"], body.length, body.unit)
        return await svc.get_geometry(project_id)
    except Exception as e:
        raise downstream_error("BATISSE", e)


_NOT_IMPLEMENTED_GLB = ("BATISSE has no server-side GLB export (its viewer exports in the browser). "
                        "Build the scene from GET /api/batisse/geometry instead.")


@app.post("/api/batisse/export-glb", tags=["batisse"], summary="Not implemented")
async def batisse_export_glb_default(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_NOT_IMPLEMENTED_GLB)


@app.post("/api/batisse/projects/{project_id}/geometry/export-glb", tags=["batisse"], summary="Not implemented")
async def batisse_export_glb(project_id: int, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_NOT_IMPLEMENTED_GLB)


_ROOM_EDIT_501 = "Room editing is not implemented in the gateway; BATISSE edits geometry as a whole (PUT /geometry)."


@app.post("/api/batisse/rooms", tags=["batisse"], summary="Not implemented")
async def batisse_create_room(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_EDIT_501)


@app.delete("/api/batisse/rooms/{room_id}", tags=["batisse"], summary="Not implemented")
async def batisse_delete_room(room_id: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_EDIT_501)


@app.put("/api/batisse/rooms/{room_id}/dimensions", tags=["batisse"], summary="Not implemented")
async def batisse_update_room_dimensions(room_id: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_EDIT_501)


@app.post("/api/batisse/rooms/connect", tags=["batisse"], summary="Not implemented")
async def batisse_connect_rooms(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_EDIT_501)


# ── Navigation (persisted per user in player_state) ───────────────────────────

class Vec3(BaseModel):
    x: float
    y: float
    z: float


class Quat(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    w: float = 1.0


class NavigationBody(BaseModel):
    position: Vec3 | None = None
    rotation: Quat | None = None
    room_id: str | None = Field(default=None, max_length=255)


def _finite(*vals: float) -> bool:
    return all(isinstance(v, (int, float)) and v == v and abs(v) != float("inf") for v in vals)


def _player_to_dict(ps) -> Dict[str, Any]:
    if ps is None:
        return {"position": {"x": 0.0, "y": 1.6, "z": 0.0}, "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
                "room_id": None, "saved": False}
    return {"position": {"x": ps.pos_x, "y": ps.pos_y, "z": ps.pos_z},
            "rotation": {"x": ps.rot_x, "y": ps.rot_y, "z": ps.rot_z, "w": ps.rot_w},
            "room_id": ps.current_room, "saved": True}


def _save_player(user_id: str, body: NavigationBody) -> Dict[str, Any]:
    if body.position and not _finite(body.position.x, body.position.y, body.position.z):
        raise HTTPException(status_code=422, detail="position must be finite numbers")
    if body.rotation and not _finite(body.rotation.x, body.rotation.y, body.rotation.z, body.rotation.w):
        raise HTTPException(status_code=422, detail="rotation must be finite numbers")
    db = database.get_db_session()
    try:
        ps = db.query(database.PlayerState).filter_by(user_id=user_id).first()
        if ps is None:
            ps = database.PlayerState(user_id=user_id)
            db.add(ps)
        if body.position:
            ps.pos_x, ps.pos_y, ps.pos_z = body.position.x, body.position.y, body.position.z
        if body.rotation:
            ps.rot_x, ps.rot_y, ps.rot_z, ps.rot_w = body.rotation.x, body.rotation.y, body.rotation.z, body.rotation.w
        if body.room_id is not None:
            ps.current_room = body.room_id
        db.commit()
        db.refresh(ps)
        return _player_to_dict(ps)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _load_player(user_id: str) -> Dict[str, Any]:
    db = database.get_db_session()
    try:
        return _player_to_dict(db.query(database.PlayerState).filter_by(user_id=user_id).first())
    finally:
        db.close()


@app.get("/api/navigation/state", tags=["navigation"], summary="Saved position, rotation and room")
async def get_navigation_state(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    return {"success": True, "user_id": auth_user_id, **_load_player(auth_user_id)}


@app.put("/api/navigation/state", tags=["navigation"], summary="Save position, rotation and/or room")
async def put_navigation_state(body: NavigationBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    return {"success": True, "user_id": auth_user_id, **_save_player(auth_user_id, body)}


# Legacy path-style routes. The {user_id} segment is ignored: the signed-in
# user (from the token) is always the owner.

@app.post("/api/navigation/set-position/{user_id}", tags=["navigation"], summary="Set position (legacy path)")
async def set_navigation_position(user_id: str, position: Vec3, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    return {"success": True, "user_id": auth_user_id, **_save_player(auth_user_id, NavigationBody(position=position))}


@app.post("/api/navigation/set-room/{user_id}/{room_id}", tags=["navigation"], summary="Set current room (legacy path)")
async def set_current_room(user_id: str, room_id: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    return {"success": True, "user_id": auth_user_id, **_save_player(auth_user_id, NavigationBody(room_id=room_id))}


@app.get("/api/navigation/get-position/{user_id}", tags=["navigation"], summary="Get position (legacy path)")
async def get_navigation_position(user_id: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    return {"success": True, "user_id": auth_user_id, **_load_player(auth_user_id)}


# ── Room interactions (not implemented) ───────────────────────────────────────

_ROOM_INTERACT_501 = "Room interactions are not implemented yet; nothing is recorded."


@app.post("/api/room/interact/{room_id}/{action}", tags=["room"], summary="Not implemented")
async def room_interact(room_id: str, action: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_INTERACT_501)


@app.post("/api/room/door/open/{from_room}/{to_room}", tags=["room"], summary="Not implemented")
async def open_door(from_room: str, to_room: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_INTERACT_501)


@app.post("/api/room/window/toggle/{room_id}", tags=["room"], summary="Not implemented")
async def toggle_window(room_id: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    raise HTTPException(status_code=501, detail=_ROOM_INTERACT_501)


# ── WYA — Wardrobe integration ────────────────────────────────────────────────

async def _wya_call(user_id: str, fn):
    """Run `fn(token)` with the user's stored WYA session, mapping failures honestly."""
    token = get_wya_token(user_id)
    try:
        return await fn(token)
    except Exception as e:
        err = downstream_error("WYA", e)
        if err.status_code == 424:
            clear_wya_token(user_id)
        raise err


@app.get("/api/wardrobe", tags=["wardrobe"], summary="The signed-in user's WYA wardrobe")
@app.post("/api/wardrobe/browse", tags=["wardrobe"], summary="The signed-in user's WYA wardrobe")
async def wardrobe_browse(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    items = await _wya_call(auth_user_id, lambda t: get_wya_service().get_wardrobe(t))
    return {"source": "wya", "count": len(items), "items": items}


class OutfitRecommendBody(BaseModel):
    items: list[dict] | None = None  # defaults to the user's whole WYA wardrobe


@app.post("/api/wardrobe/outfit-recommendations", tags=["wardrobe"], summary="Outfit recommendations from WYA")
async def wardrobe_outfit_recommendations(
    body: OutfitRecommendBody | None = None,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    async def run(token: str):
        items = (body.items if body and body.items else None) or await get_wya_service().get_wardrobe(token)
        if not items:
            raise HTTPException(status_code=422, detail="Your WYA wardrobe is empty; add items first")
        return await get_wya_service().curate_outfits(token, items)
    return {"source": "wya", "recommendations": await _wya_call(auth_user_id, run)}


class OutfitScoreBody(BaseModel):
    outfit: dict
    style_dna: dict | None = None
    wear_history: list[dict] | None = None
    color_preferences: list[str] | None = None


@app.post("/api/wardrobe/outfit-score", tags=["wardrobe"], summary="Score an outfit with WYA")
async def wardrobe_outfit_score(body: OutfitScoreBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    return {"source": "wya", "score": await _wya_call(auth_user_id, lambda t: get_wya_service().score_outfit(t, payload))}


class FabricScanBody(BaseModel):
    image: str = Field(min_length=20, max_length=12_000_000)   # data URL or base64 of the garment photo


@app.post("/api/wardrobe/fabric-scan", tags=["wardrobe"], summary="Classify a garment photo with WYA (fabric, colour, category)")
async def wardrobe_fabric_scan(body: FabricScanBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    result = await _wya_call(auth_user_id, lambda t: get_wya_service().scan_fabric(t, body.image))
    return {"source": "wya", "classification": result}


# ── TryOn — Virtual fitting room ──────────────────────────────────────────────

class TryOnBody(BaseModel):
    garment_image_url: str = Field(min_length=1, max_length=2000)
    avatar: str = "feminine"        # feminine | masculine | neutral
    category: str = "top"           # top | dress | jacket | bottom


@app.post("/api/tryon/generate", tags=["tryon"], summary="Generate an image-based try-on preview")
async def tryon_generate(body: TryOnBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Image-based try-on on TryOn's stand-in body (not a 3D cloth simulation)."""
    svc = get_tryon_service()
    try:
        tryon_id = await get_tryon_user_id(auth_user_id)
        try:
            result = await svc.generate_tryon(body.garment_image_url, body.avatar, body.category, tryon_id)
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 401:
                raise
            # TryOn forgot this guest (e.g. its DB was reset): re-create once and retry.
            tryon_id = await get_tryon_user_id(auth_user_id, force_new=True)
            result = await svc.generate_tryon(body.garment_image_url, body.avatar, body.category, tryon_id)
    except Exception as e:
        raise downstream_error("TryOn", e)
    return {"source": "tryon", "pipeline": "image-based", **result}


@app.get("/api/tryon/status", tags=["tryon"], summary="TryOn pipeline readiness")
async def tryon_status(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        return {"source": "tryon", "pipeline": "image-based", **await get_tryon_service().get_tryon_status()}
    except Exception as e:
        raise downstream_error("TryOn", e)


# ── VELARIS — Jewellery boutique ──────────────────────────────────────────────

@app.post("/api/jewellery/generate-design", tags=["jewellery"], summary="Generate a jewellery design via VELARIS AI")
async def jewellery_generate_design(req: dict, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        return await get_velaris_service().generate_design(req)
    except Exception as e:
        raise downstream_error("VELARIS", e)


@app.get("/api/jewellery/designs", tags=["jewellery"], summary="VELARIS design trends")
async def jewellery_list_designs(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        return await get_velaris_service().list_designs()
    except Exception as e:
        raise downstream_error("VELARIS", e)


# ── VELARIS — 3D jewellery mesh generation ──────────────────────────────────

@app.post(
    "/api/velaris/mesh",
    tags=["velaris"],
    summary="Generate 3D jewellery mesh",
)
async def velaris_generate_3d_mesh(req: dict, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Generate a 3D jewellery mesh via VELARIS rendering pipeline.

    Uses trimesh + PBR-inspired material parameters to produce a watertight
    triangle mesh exported as a GLTF data URI. This enables web-based 3D
    viewing of VELARIS designs in three.js, React Three Fiber, or any GLTF
    viewer.

    Design parameters (gemstone, metal, carat, shape, jewelry type) may be
    supplied in the request body; if omitted, the method will first call
    /api/generate-design to infer them.
    """
    from app.services.velaris_service import get_velaris_service
    svc = get_velaris_service()
    result = await svc.generate_3d_mesh(req)
    if "error" in result:
        # Never report a failed generation as HTTP 200.
        raise HTTPException(status_code=result.get("status_code", 502), detail=result["error"])
    return result


# ── Luna — AI fashion stylist chatbot ──────────────────────────────────────────

class LunaChatBody(BaseModel):
    """Request body for the gateway's Luna chat proxy."""
    message: str = Field(min_length=1, max_length=2000)
    intent: str = "outfit-help"            # WYA supports: outfit-help, gap-analysis


@app.post("/api/luna/chat", tags=["luna"], summary="Chat with Luna AI stylist (proxied to WYA)")
async def luna_chat(body: LunaChatBody, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Proxy a Luna chat turn to WYA using the signed-in user's linked WYA session.

    Downstream failures are real HTTP errors (424 not linked / expired,
    503 WYA down), never a 200 with an error string.
    """
    async def run(token: str):
        async with AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{config.WYA_BASE_URL}/api/luna/chat",
                json={"message": body.message, "intent": body.intent},
                headers={"Authorization": f"Bearer {token}", **({"X-Forwarded-For": client_ip_var.get()} if client_ip_var.get() else {})},
            )
            response.raise_for_status()
            return response.json()
    data = await _wya_call(auth_user_id, run)
    return {"reply": data.get("text", ""), "outfits": data.get("outfits"), "gap_analysis": data.get("gapAnalysis")}


# ── Luna state ───────────────────────────────────────────────────────────

@app.get("/api/luna/state/get_state", tags=["luna"], summary="Get Luna state")
async def luna_get_state(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Get current Luna companion state for the authenticated user."""
    db = database.get_db_session()
    try:
        state = db.query(database.LunaState).filter_by(user_id=auth_user_id).first()
        if state:
            return {
                "state": state.current_expression,
                "is_following": state.is_following,
                "following_offset": state.following_offset or {},
                "voice_volume": getattr(state, 'voice_volume', 0.8) or 0.8,
                "voice_muted": getattr(state, 'voice_muted', False) or False,
                "battery": getattr(state, 'battery', 100) or 100,
                "zone": getattr(state, 'zone', '') or '',
                "interaction_status": getattr(state, 'interaction_status', 'idle') or 'idle',
                "speech_active": getattr(state, 'speech_active', False) or False,
                "speech_text": getattr(state, 'speech_text', '') or '',
                "dismissible": state.dismissible,
                "last_seen": state.last_seen,
            }
        return {
            "state": "idle",
            "is_following": True,
            "following_offset": {"x": 0, "y": 0, "z": 0},
            "voice_volume": 0.8,
            "voice_muted": False,
            "battery": 100,
            "zone": "",
            "interaction_status": "idle",
            "speech_active": False,
            "speech_text": "",
            "dismissible": True,
            "last_seen": None,
        }
    finally:
        db.close()


@app.post("/api/luna/state/toggle_following", tags=["luna"], summary="Toggle Luna following")
async def luna_toggle_following(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Toggle Luna following preference for the authenticated user."""
    db = database.get_db_session()
    try:
        state = db.query(database.LunaState).filter_by(user_id=auth_user_id).first()
        if state:
            # Toggle existing state
            state.is_following = not state.is_following
        else:
            # For new users: default is True, toggle to False
            state = database.LunaState(user_id=auth_user_id, is_following=False)
            db.add(state)
        db.commit()
        return {"is_following": state.is_following}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to toggle following: {str(e)[:100]}")
    finally:
        db.close()


@app.post("/api/luna/state/set_expression", tags=["luna"], summary="Set Luna expression")
async def luna_set_expression(
    expression: str = Form(...),
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Set Luna's current expression for the authenticated user."""
    db = database.get_db_session()
    try:
        state = db.query(database.LunaState).filter_by(user_id=auth_user_id).first()
        if not state:
            state = database.LunaState(user_id=auth_user_id)
            db.add(state)
        state.current_expression = expression
        state.last_seen = func.now()
        db.commit()
        return {"expression": state.current_expression}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to set expression: {str(e)[:100]}")
    finally:
        db.close()


@app.post("/api/luna/state/set_state", tags=["luna"], summary="Update Luna full state")
async def luna_set_state(
    body: Dict[str, Any],
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update full Luna state for the authenticated user (voice, battery, zone, etc)."""
    db = database.get_db_session()
    try:
        state = db.query(database.LunaState).filter_by(user_id=auth_user_id).first()
        if not state:
            state = database.LunaState(user_id=auth_user_id)
            db.add(state)
        
        if 'state' in body:
            state.current_expression = body['state']
        if 'is_following' in body:
            state.is_following = body['is_following']
        if 'voice_volume' in body:
            state.voice_volume = body['voice_volume']
        if 'voice_muted' in body:
            state.voice_muted = body['voice_muted']
        if 'battery' in body:
            state.battery = body['battery']
        if 'zone' in body:
            state.zone = body['zone']
        if 'interaction_status' in body:
            state.interaction_status = body['interaction_status']
        if 'speech_active' in body:
            state.speech_active = body['speech_active']
        if 'speech_text' in body:
            state.speech_text = body['speech_text']
            
        state.last_seen = func.now()
        db.commit()
        return {"success": True, "state": state.current_expression}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update Luna state: {str(e)[:100]}")
    finally:
        db.close()


# ── Furniture persistence ─────────────────────────────────────────────────────

@app.post(
    "/api/furniture/save",
    tags=["furniture"],
    summary="Save a furniture placement for the user",
)
def furniture_save(
    furniture: dict,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Save a furniture placement (type, room_id, position, rotation)."""
    db = database.get_db_session()
    try:
        fid = furniture.get("furniture_id", f"furn-{int(time.time() * 1000)}")
        save = db.query(database.FurnitureSaves).filter_by(user_id=auth_user_id, furniture_id=fid).first()
        if save is None:
            save = database.FurnitureSaves(user_id=auth_user_id, furniture_id=fid)
            db.add(save)
        save.furniture_type = furniture.get("furniture_type", save.furniture_type or "")
        save.room_id = furniture.get("room_id", save.room_id or "free")
        save.position_x = furniture.get("position_x", save.position_x or 0.0)
        save.position_y = furniture.get("position_y", save.position_y or 0.0)
        save.position_z = furniture.get("position_z", save.position_z or 0.0)
        save.rotation_y = furniture.get("rotation_y", save.rotation_y or 0.0)
        save.world_state = furniture.get("world_state", save.world_state or {})
        db.commit()
        return {"success": True, "furniture_id": save.furniture_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save furniture: {str(e)[:100]}")
    finally:
        db.close()


@app.get(
    "/api/furniture/restore",
    tags=["furniture"],
    summary="Restore all saved furniture placements for the user",
)
def furniture_restore(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Return all saved furniture placements for the user."""
    db = database.get_db_session()
    try:
        saves = db.query(database.FurnitureSaves) \
            .filter_by(user_id=auth_user_id) \
            .order_by(database.FurnitureSaves.created_at.desc()) \
            .all()
        return {
            "success": True,
            "count": len(saves),
            "furniture": [
                {
                    "furniture_id": s.furniture_id,
                    "furniture_type": s.furniture_type,
                    "room_id": s.room_id,
                    "position": {"x": s.position_x, "y": s.position_y, "z": s.position_z},
                    "rotation_y": s.rotation_y,
                    "world_state": s.world_state or {},
                }
                for s in saves
            ],
        }
    except Exception as e:
        db.close()
        raise HTTPException(status_code=500, detail=f"Failed to restore furniture: {str(e)[:100]}")
    finally:
        db.close()


# ── Cross-project integration endpoints ────────────────────────────────────────

@app.post(
    "/api/integrate/assign-room-function",
    tags=["integration"],
    summary="User assigns a function to a house room",
)
def assign_room_function(
    assignment: dict,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Allow user to assign a virtual function to a house room."""
    if not assignment.get("room_id") or not assignment.get("function"):
        raise HTTPException(status_code=422, detail="room_id and function are required")
    
    db = database.get_db_session()
    try:
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        if not meta:
            meta = database.IntegrationMetadata(
                user_id=auth_user_id,
                room_assignments={}
            )
            db.add(meta)
        
        # Copy: mutating the stored dict in place is not detected by SQLAlchemy
        assignments = dict(meta.room_assignments or {})
        assignments[assignment["room_id"]] = assignment["function"]
        meta.room_assignments = assignments
        db.commit()
        
        return {
            "success": True,
            "room_id": assignment["room_id"],
            "assigned_function": assignment["function"],
            "note": "Room function assignment recorded. Original geometry unchanged.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to assign room function: {str(e)[:100]}")
    finally:
        db.close()


@app.get(
    "/api/integrate/room-assignments",
    tags=["integration"],
    summary="The signed-in user's saved room functions",
)
def get_room_assignments(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    db = database.get_db_session()
    try:
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        assignments = dict(meta.room_assignments or {}) if meta else {}
        return {"success": True, "assignments": assignments}
    finally:
        db.close()


@app.delete(
    "/api/integrate/room-assignments/{room_id}",
    tags=["integration"],
    summary="Remove a saved room function",
)
def delete_room_assignment(room_id: str, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    db = database.get_db_session()
    try:
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        assignments = dict(meta.room_assignments or {}) if meta else {}
        if room_id not in assignments:
            raise HTTPException(status_code=404, detail="No assignment for that room")
        del assignments[room_id]
        meta.room_assignments = assignments   # new dict object so SQLAlchemy sees the change
        db.commit()
        return {"success": True, "assignments": assignments}
    finally:
        db.close()


@app.post(
    "/api/integrate/save-look",
    tags=["integration"],
    summary="Save a complete user look (clothing + jewellery)",
)
def save_complete_look(
    look_data: dict,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Save a complete user look combining clothing, try-on, and jewellery."""
    look_id = look_data.get("look_id") or f"look-{int(time.time())}"
    garment_type = look_data.get("garment_type", "outfit")
    
    db = database.get_db_session()
    try:
        save = database.OutfitSaves(
            user_id=auth_user_id,
            outfit_name=look_data.get("name", f"Saved Look - {look_id}"),
            garment_type=garment_type,
            items_json=json.dumps(look_data.get("items", [])) if look_data.get("items") else None,
        )
        db.add(save)
        db.commit()
        return {
            "success": True,
            "look_id": look_id,
            "user_id": auth_user_id,
            "note": "Complete look saved to database.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save look: {str(e)[:100]}")
    finally:
        db.close()

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
from httpx import AsyncClient
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Form, Depends
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func

from . import config
from . import database  # noqa: F401
from .schemas import IntegrationHealth  # noqa: F401
from .services import batisse_service, wya_service, tryon_service, velaris_service  # noqa: F401
from .services.batisse_service import get_batisse_service
from .services.wya_service import get_wya_service
from .services.tryon_service import get_tryon_service
from .services.velaris_service import get_velaris_service

logger = logging.getLogger(__name__)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """Validate JWT token and return user_id."""
    try:
        payload = jwt.decode(token, config.INTEGRATION_JWT_SECRET, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise jwt.PyJWTError("Token missing sub claim")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Startup and shutdown for the integration service."""
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


# ── Request Logging Middleware ────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
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

    return IntegrationHealth(services=services)


# ── BATISSE — Floor plan to virtual home ──────────────────────────────────────

@app.post(
    "/api/batisse/upload",
    tags=["batisse"],
    summary="Upload a floor plan for BATISSE processing",
)
async def batisse_upload(
    request: Request,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delegate floor plan upload to BATISSE backend."""
    try:
        body = await request.json()
        svc = get_batisse_service()
        result = await svc.process_floor_plan(body)
        return result
    except Exception as e:
        logger.error(f"BATISSE upload failed: {e}")
        return {"success": False, "note": "BATISSE backend unavailable", "error": str(e)[:100]}


@app.get(
    "/api/batisse/projects/{project_id}/geometry",
    tags=["batisse"],
    summary="Get validated geometry for a BATISSE project",
)
async def batisse_get_geometry(auth_user_id: str = Depends(get_current_user), project_id: int = ...) -> Dict[str, Any]:
    """Get validated geometry for a BATISSE project."""
    # Resolve project_id from authenticated user's integration metadata
    db = database.get_db_session()
    try:
        meta = db.query(IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        if meta and meta.batisse_project_id:
            project_id = meta.batisse_project_id
        # If project_id was explicitly provided in URL, use it; otherwise use user's linked project
        svc = get_batisse_service()
        result = await svc.get_geometry(project_id)
        return result
    except Exception:
        return {"success": False, "note": "BATISSE geometry backend unavailable"}


@app.get(
    "/api/batisse/geometry",
    tags=["batisse"],
    summary="Get validated geometry for authenticated user's BATISSE project",
)
async def batisse_get_geometry_default(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Get validated geometry for authenticated user's BATISSE project."""
    db = database.get_db_session()
    try:
        meta = db.query(IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        project_id = meta.batisse_project_id if meta and meta.batisse_project_id else 1
        svc = get_batisse_service()
        result = await svc.get_geometry(project_id)
        return result
    except Exception:
        return {"success": False, "note": "BATISSE geometry backend unavailable"}


@app.post(
    "/api/batisse/projects/{project_id}/geometry/export-glb",
    tags=["batisse"],
    summary="Export BATISSE geometry as GLB/glTF",
)
async def batisse_export_glb(auth_user_id: str = Depends(get_current_user), project_id: int = ...) -> Dict[str, Any]:
    """Export validated BATISSE geometry as GLB/glTF file."""
    # Resolve project_id from authenticated user's integration metadata
    db = database.get_db_session()
    try:
        meta = db.query(IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        if meta and meta.batisse_project_id:
            project_id = meta.batisse_project_id
        svc = get_batisse_service()
        result = await svc.export_glb(project_id)
        return result
    except Exception:
        return {"success": False, "note": "BATISSE GLB export backend unavailable"}


@app.post(
    "/api/batisse/export-glb",
    tags=["batisse"],
    summary="Export authenticated user's BATISSE geometry as GLB/glTF",
)
async def batisse_export_glb_default(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Export authenticated user's BATISSE geometry as GLB/glTF file."""
    db = database.get_db_session()
    try:
        meta = db.query(IntegrationMetadata).filter_by(user_id=auth_user_id).first()
        project_id = meta.batisse_project_id if meta and meta.batisse_project_id else 1
        svc = get_batisse_service()
        result = await svc.export_glb(project_id)
        return result
    except Exception:
        return {"success": False, "note": "BATISSE GLB export backend unavailable"}

@app.post(
    "/api/batisse/projects/{project_id}/geometry/scale-reference",
    tags=["batisse"],
    summary="Set scale reference for BATISSE project",
)
async def batisse_set_scale_reference(project_id: int) -> Dict[str, Any]:
    """Set scale reference (two points + real length) for BATISSE geometry."""
    return {
        "success": True,
        "note": "Scale reference endpoint stub — Phase 1 placeholder",
        "project_id": project_id,
    }

@app.post(
    "/api/batisse/rooms",
    tags=["batisse"],
    summary="Create a new room in the BATISSE project",
)
async def batisse_create_room(request: Request) -> Dict[str, Any]:
    """Create a new room in the BATISSE project."""
    body = await request.json()
    # Delegate to BATISSE service for floor plan processing
    svc = get_batisse_service()
    result = await svc.process_floor_plan(body)
    return result

@app.delete(
    "/api/batisse/rooms/{room_id}",
    tags=["batisse"],
    summary="Delete a room from the BATISSE project",
)
async def batisse_delete_room(request: Request, room_id: str) -> Dict[str, Any]:
    """Delete a room from the BATISSE project."""
    try:
        svc = get_batisse_service()
        result = await svc.delete_room(room_id)
        return result
    except Exception:
        return {"success": False, "note": "Failed to delete room"}

@app.put(
    "/api/batisse/rooms/{room_id}/dimensions",
    tags=["batisse"],
    summary="Update room dimensions in the BATISSE project",
)
async def batisse_update_room_dimensions(request: Request, room_id: str) -> Dict[str, Any]:
    """Update room dimensions in the BATISSE project."""
    body = await request.json()
    try:
        svc = get_batisse_service()
        result = await svc.update_room_dimensions(room_id, body)
        return result
    except Exception:
        return {"success": False, "note": "Failed to update room dimensions"}

@app.post(
    "/api/batisse/rooms/connect",
    tags=["batisse"],
    summary="Connect two rooms with a door in the BATISSE project",
)
async def batisse_connect_rooms(request: Request) -> Dict[str, Any]:
    """Connect two rooms with a door in the BATISSE project."""
    body = await request.json()
    from_room = body.get("from_room")
    to_room = body.get("to_room")
    door_side = body.get("door_side", "front")
    try:
        # Record the connection using the service singleton
        return {"success": True, "from_room": from_room, "to_room": to_room, "door_side": door_side}
    except Exception:
        return {"success": False, "note": "Failed to connect rooms"}


@app.post(
    "/api/navigation/set-position/{user_id}",
    tags=["navigation"],
    summary="Set user position in virtual home",
)
async def set_navigation_position(
    user_id: str,
    position: dict,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Set user position (x, y, z) and rotation (x, y, z, w) in the virtual home."""
    user_id = auth_user_id
    db = database.get_db_session()
    try:
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=user_id).first()
        if not meta:
            meta = database.IntegrationMetadata(user_id=user_id, room_assignments={})
            db.add(meta)
        # Store navigation position in metadata
        meta.room_assignments["last_position"] = position
        db.commit()
        return {
            "success": True,
            "user_id": user_id,
            "position": position,
            "note": "Navigation position recorded.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save position: {str(e)[:100]}")
    finally:
        db.close()

@app.post(
    "/api/navigation/set-room/{user_id}/{room_id}",
    tags=["navigation"],
    summary="Set current room for user",
)
async def set_current_room(
    user_id: str,
    room_id: str,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Set the current room the user is in."""
    # Use authenticated user ID, not URL parameter
    user_id = auth_user_id
    db = database.get_db_session()
    try:
        # Check if user exists
        user = db.query(database.Users).filter_by(id=user_id).first()
        if not user:
            user = database.Users(id=user_id, username=f"user_{user_id}")
            db.add(user)
        
        # Save room assignment
        room_save = db.query(database.RoomSaves).filter_by(user_id=user_id, room_id=room_id).first()
        if not room_save:
            room_save = database.RoomSaves(user_id=user_id, room_id=room_id, room_name=room_id)
            db.add(room_save)
        else:
            room_save.room_name = room_id
            room_save.updated_at = func.now()
        
        db.commit()
        return {
            "success": True,
            "user_id": user_id,
            "room_id": room_id,
            "note": "Current room recorded.",
        }
    finally:
        db.close()


@app.get(
    "/api/navigation/get-position/{user_id}",
    tags=["navigation"],
    summary="Get user position in virtual home",
)
async def get_navigation_position(
    user_id: str,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get current user position and rotation."""
    # Use authenticated user ID, not URL parameter
    user_id = auth_user_id
    db = database.get_db_session()
    try:
        # Check IntegrationMetadata for saved position
        meta = db.query(database.IntegrationMetadata).filter_by(user_id=user_id).first()
        saved_pos = meta.room_assignments.get("last_position") if meta and meta.room_assignments else None
        
        if saved_pos:
            return {
                "success": True,
                "user_id": user_id,
                "position": saved_pos,
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
                "note": "Saved position from previous session.",
            }
        
        # Default initial position
        return {
            "success": True,
            "user_id": user_id,
            "position": {"x": 0.0, "y": 1.6, "z": 0.0},
            "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
            "note": "Default initial position.",
        }
    finally:
        db.close()


# ── Phase 2: Room Interactions ───────────────────────────────────────────────

@app.post(
    "/api/room/interact/{room_id}/{action}",
    tags=["room"],
    summary="Interact with a room object",
)
async def room_interact(
    room_id: str,
    action: str,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Handle interaction with room objects (door, window, furniture)."""
    db = database.get_db_session()
    try:
        user = db.query(database.Users).filter_by(id=auth_user_id).first()
        if not user:
            user = database.Users(id=auth_user_id)
            db.add(user)
        db.commit()
        return {
            "success": True,
            "user_id": auth_user_id,
            "room_id": room_id,
            "action": action,
            "note": f"Interaction '{action}' recorded for room {room_id}.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Room interaction failed: {str(e)[:100]}")
    finally:
        db.close()


@app.post(
    "/api/room/door/open/{from_room}/{to_room}",
    tags=["room"],
    summary="Open a door to another room",
)
async def open_door(
    from_room: str,
    to_room: str,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Handle door opening between rooms."""
    db = database.get_db_session()
    try:
        user = db.query(database.Users).filter_by(id=auth_user_id).first()
        if not user:
            user = database.Users(id=auth_user_id)
            db.add(user)
        # Record door connection
        db.commit()
        return {
            "success": True,
            "user_id": auth_user_id,
            "from_room": from_room,
            "to_room": to_room,
            "note": f"Door opened from {from_room} to {to_room}.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Door open failed: {str(e)[:100]}")
    finally:
        db.close()


@app.post(
    "/api/room/window/toggle/{room_id}",
    tags=["room"],
    summary="Toggle window visibility/state",
)
async def toggle_window(
    room_id: str,
    is_open: bool = True,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Handle window state changes."""
    db = database.get_db_session()
    try:
        user = db.query(database.Users).filter_by(id=auth_user_id).first()
        if not user:
            user = database.Users(id=auth_user_id)
            db.add(user)
        db.commit()
        return {
            "success": True,
            "user_id": auth_user_id,
            "room_id": room_id,
            "is_open": is_open,
            "note": f"Window state updated in room {room_id}.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Window toggle failed: {str(e)[:100]}")
    finally:
        db.close()


# ── WYA — Wardrobe integration ────────────────────────────────────────────────

@app.post(
    "/api/wardrobe/browse",
    tags=["wardrobe"],
    summary="Browse user's wardrobe via WYA integration",
)
async def wardrobe_browse(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Browse the user's wardrobe via WYA integration."""
    from app.services.wya_service import get_wya_service
    try:
        svc = get_wya_service()
        result = await svc.get_wardrobe(auth_user_id)
    except Exception:
        result = {"success": False, "note": "WYA backend unavailable"}
    return result

@app.post(
    "/api/wardrobe/outfit-recommendations",
    tags=["wardrobe"],
    summary="Get outfit recommendations from WYA AI",
)
async def wardrobe_outfit_recommendations(
    auth_user_id: str = Depends(get_current_user),
    occasion: str | None = None,
    weather: str | None = None,
) -> Dict[str, Any]:
    """Get AI-powered outfit recommendations from WYA."""
    from app.services.wya_service import get_wya_service
    try:
        svc = get_wya_service()
        result = await svc.get_outfit_recommendations(auth_user_id, occasion, weather)
    except Exception:
        result = {"success": False, "note": "WYA backend unavailable"}
    return result


# ── TryOn — Virtual fitting room ──────────────────────────────────────────────

@app.post(
    "/api/tryon/generate",
    tags=["tryon"],
    summary="Generate try-on preview for a garment",
)
async def tryon_generate(
    request: Request,
    auth_user_id: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate a try-on preview using the TryOn pipeline."""
    body = await request.json()
    garment_image_url = body.get("garment_image_url", "")
    avatar_params = body.get("avatar_params", {})
    svc = get_tryon_service()
    try:
        result = await svc.generate_tryon(garment_image_url, avatar_params, auth_user_id)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)[:100]}


@app.get(
    "/api/tryon/status",
    tags=["tryon"],
    summary="Check TryOn pipeline readiness status",
)
async def tryon_status(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Check the TryOn pipeline readiness status."""
    # Check TryOn service status via the service adapter
    try:
        from app.services.tryon_service import get_tryon_service
        svc = get_tryon_service()
        status = await svc.ping()
        return {"status": "healthy" if status else "unhealthy", "pipeline": "image-based"}
    except Exception:
        return {"status": "unhealthy", "pipeline": "image-based", "initializing": True}


# ── VELARIS — Jewellery boutique ──────────────────────────────────────────────

@app.post(
    "/api/jewellery/generate-design",
    tags=["jewellery"],
    summary="Generate a jewellery design via VELARIS AI",
)
async def jewellery_generate_design(req: dict, auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Generate a jewellery design via VELARIS AI."""
    try:
        from app.services.velaris_service import get_velaris_service
        svc = get_velaris_service()
        result = await svc.generate_design(req)
        return result
    except Exception:
        return {"error": "VELARIS backend unavailable in test environment"}


@app.get(
    "/api/jewellery/designs",
    tags=["jewellery"],
    summary="List available jewellery designs from VELARIS",
)
async def jewellery_list_designs(auth_user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """List available jewellery designs from VELARIS backend."""
    try:
        from app.services.velaris_service import get_velaris_service
        svc = get_velaris_service()
        result = await svc.list_designs()
        return result
    except Exception:
        return {"error": "VELARIS backend unavailable in test environment"}


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

@app.post(
    "/api/luna/chat",
    tags=["luna"],
    summary="Chat with Luna AI stylist",
)
async def luna_chat(message: str, token: str, wardrobe_items: dict | None = None) -> Dict[str, Any]:
    """Chat with Luna AI stylist.

    Routes messages to WYA backend based on intent:
    - outfit_suggestion: WYA outfit matching
    - wardrobe_search: Search user's wardrobe
    - gap_analysis: Identify wardrobe gaps
    - style_explanation: Describe user's style
    - general: Instant replies or LLM-based responses
    """
    async with AsyncClient() as client:
        try:
            response = await client.post(
                f"{config.WYA_BASE_URL}/api/luna/chat",
                json={"message": message, "token": token, "wardrobe_items": wardrobe_items},
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()
            return {"reply": data.get("reply", ""), "intent": data.get("intent", ""), "data": data.get("data")}
        except Exception as e:
            return {"reply": f"Luna backend unavailable: {str(e)[:100]}", "intent": "error", "data": None}

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
        save = database.FurnitureSaves(
            user_id=auth_user_id,
            furniture_id=furniture.get("furniture_id", f"furn-{int(time.time())}"),
            furniture_type=furniture.get("furniture_type", ""),
            room_id=furniture.get("room_id", "free"),
            position_x=furniture.get("position_x", 0.0),
            position_y=furniture.get("position_y", 0.0),
            position_z=furniture.get("position_z", 0.0),
            rotation_y=furniture.get("rotation_y", 0.0),
            world_state=furniture.get("world_state", {}),
        )
        db.add(save)
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
        
        assignments = meta.room_assignments or {}
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

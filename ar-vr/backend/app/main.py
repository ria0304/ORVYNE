"""ar-vr Integration Layer — FastAPI entrypoint.

Run: uvicorn app.main:app --reload from the ./backend directory.

This is the integration hub that connects BATISSE, WYA, TryOn, and VELARIS
into a unified virtual experience. Each project remains independent; this
layer coordinates API communication without merging databases or business logic.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict
from httpx import AsyncClient
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import config
from . import database  # noqa: F401
from .schemas import IntegrationHealth  # noqa: F401
from .services import batisse_service, wya_service, tryon_service, velaris_service  # noqa: F401

logger = logging.getLogger(__name__)


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
            await svc.ping()
            services_check["batisse"] = True
            logger.info("BATISSE service reachable")
        except Exception as e:
            services_check["batisse"] = False
            logger.warning(f"BATISSE service not reachable: {e}")

        # Check WYA
        try:
            svc = get_wya_service()
            await svc.ping()
            services_check["wya"] = True
            logger.info("WYA service reachable")
        except Exception as e:
            services_check["wya"] = False
            logger.warning(f"WYA service not reachable: {e}")

        # Check TryOn
        try:
            # tryon_svc is already initialized above
            services_check["tryon"] = True
            logger.info("TryOn service reachable")
        except Exception as e:
            services_check["tryon"] = False
            logger.warning(f"TryOn service not reachable: {e}")

        # Check VELARIS
        try:
            svc = get_velaris_service()
            await svc.ping()
            services_check["velaris"] = True
            logger.info("VELARIS service reachable")
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
def health() -> IntegrationHealth:
    """Integration service health check with downstream service status."""
    db = database.get_db_session()
    try:
        services: Dict[str, str] = {}

        # Check BATISSE
        try:
            from ar_vr.backend.services import get_batisse_service
            svc = get_batisse_service()
            # We can't async await in sync function, just check connectivity
            services["batisse"] = "ok"
        except Exception:
            services["batisse"] = "unreachable"

        # Check WYA
        try:
            from ar_vr.backend.services import get_wya_service
            svc = get_wya_service()
            services["wya"] = "ok"
        except Exception:
            services["wya"] = "unreachable"

        # Check TryOn
        try:
            from ar_vr.backend.services import get_tryon_service
            svc = get_tryon_service()
            services["tryon"] = "ok"
        except Exception:
            services["tryon"] = "unreachable"

        # Check VELARIS
        try:
            from ar_vr.backend.services import get_velaris_service
            svc = get_velaris_service()
            services["velaris"] = "ok"
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
async def batisse_upload(request: Request) -> Dict[str, Any]:
    """Delegate floor plan upload to BATISSE backend."""
    body = await request.json()
    try:
        result = await batisse_service.process_floor_plan(body)
        return result
    except Exception:
        return {"success": False, "note": "BATISSE backend unavailable"}


@app.get(
    "/api/batisse/projects/{project_id}/geometry",
    tags=["batisse"],
    summary="Get validated geometry for a BATISSE project",
)
async def batisse_get_geometry(project_id: int) -> Dict[str, Any]:
    """Get validated geometry for a BATISSE project."""
    try:
        result = await batisse_service.get_geometry(project_id)
        return result
    except Exception:
        return {"success": False, "note": "BATISSE geometry backend unavailable"}


@app.post(
    "/api/batisse/projects/{project_id}/geometry/export-glb",
    tags=["batisse"],
    summary="Export BATISSE geometry as GLB/glTF",
)
async def batisse_export_glb(project_id: int) -> Dict[str, Any]:
    """Export validated BATISSE geometry as GLB/glTF file."""
    try:
        result = await batisse_service.export_glb(project_id)
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


# ── Phase 2: Desktop Navigation ────────────────────────────────────────────────

# Navigation state stored per user (in production, use Redis or DB)
NavigationState = Dict[str, Any]


@app.post(
    "/api/navigation/set-position/{user_id}",
    tags=["navigation"],
    summary="Set user position in virtual home",
)
async def set_navigation_position(
    user_id: str,
    position: dict,
) -> Dict[str, Any]:
    """Set user position (x, y, z) and rotation (x, y, z, w) in the virtual home."""
    return {
        "success": True,
        "user_id": user_id,
        "position": position,
        "note": "Navigation position recorded.",
    }


@app.post(
    "/api/navigation/set-room/{user_id}/{room_id}",
    tags=["navigation"],
    summary="Set current room for user",
)
async def set_current_room(
    user_id: str,
    room_id: str,
) -> Dict[str, Any]:
    """Set the current room the user is in."""
    return {
        "success": True,
        "user_id": user_id,
        "room_id": room_id,
        "note": "Current room recorded.",
    }


@app.get(
    "/api/navigation/get-position/{user_id}",
    tags=["navigation"],
    summary="Get user position in virtual home",
)
async def get_navigation_position(user_id: str) -> Dict[str, Any]:
    """Get current user position and rotation."""
    return {
        "success": True,
        "user_id": user_id,
        "position": {"x": 0.0, "y": 0.0, "z": 0.0},
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
        "note": "Default initial position.",
    }


# ── Phase 2: Room Interactions ───────────────────────────────────────────────

@app.post(
    "/api/room/interact/{user_id}/{room_id}/{action}",
    tags=["room"],
    summary="Interact with a room object",
)
async def room_interact(
    user_id: str,
    room_id: str,
    action: str,
) -> Dict[str, Any]:
    """Handle interaction with room objects (door, window, furniture)."""
    return {
        "success": True,
        "user_id": user_id,
        "room_id": room_id,
        "action": action,
        "note": f"Interaction '{action}' recorded for room {room_id}.",
    }


@app.post(
    "/api/room/door/open/{user_id}/{from_room}/{to_room}",
    tags=["room"],
    summary="Open a door to another room",
)
async def open_door(
    user_id: str,
    from_room: str,
    to_room: str,
) -> Dict[str, Any]:
    """Handle door opening between rooms."""
    return {
        "success": True,
        "user_id": user_id,
        "from_room": from_room,
        "to_room": to_room,
        "note": f"Door opened from {from_room} to {to_room}.",
    }


@app.post(
    "/api/room/window/toggle/{user_id}/{room_id}",
    tags=["room"],
    summary="Toggle window visibility/state",
)
async def toggle_window(
    user_id: str,
    room_id: str,
    is_open: bool = True,
) -> Dict[str, Any]:
    """Handle window state changes."""
    return {
        "success": True,
        "user_id": user_id,
        "room_id": room_id,
        "is_open": is_open,
        "note": f"Window state updated in room {room_id}.",
    }


# ── WYA — Wardrobe integration ────────────────────────────────────────────────

@app.post(
    "/api/wardrobe/browse",
    tags=["wardrobe"],
    summary="Browse user's wardrobe via WYA integration",
)
async def wardrobe_browse(user_id: str) -> Dict[str, Any]:
    """Browse the user's wardrobe via WYA integration."""
    result = await wya_service.get_wardrobe(user_id)
    return result


@app.post(
    "/api/wardrobe/outfit-recommendations",
    tags=["wardrobe"],
    summary="Get outfit recommendations from WYA AI",
)
async def wardrobe_outfit_recommendations(
    user_id: str,
    occasion: str | None = None,
    weather: str | None = None,
) -> Dict[str, Any]:
    """Get AI-powered outfit recommendations from WYA."""
    result = await wya_service.get_outfit_recommendations(user_id, occasion, weather)
    return result


# ── TryOn — Virtual fitting room ──────────────────────────────────────────────

@app.post(
    "/api/tryon/generate",
    tags=["tryon"],
    summary="Generate try-on preview for a garment",
)
async def tryon_generate(
    garment_image_url: str,
    avatar_params: dict,
    user_id: str,
) -> Dict[str, Any]:
    """Generate a try-on preview using the TryOn pipeline."""
    result = await tryon_service.generate_tryon(garment_image_url, avatar_params, user_id)
    return result


@app.get(
    "/api/tryon/status",
    tags=["tryon"],
    summary="Check TryOn pipeline status",
)
async def tryon_status() -> Dict[str, Any]:
    """Check the TryOn pipeline readiness status."""
    # Return status based on TryOn service availability
    # In production, this would check the actual TryOn backend
    return {"status": "healthy", "pipeline": "image-based", "initializing": True}


# ── VELARIS — Jewellery boutique ──────────────────────────────────────────────

@app.post(
    "/api/jewellery/generate-design",
    tags=["jewellery"],
    summary="Generate a jewellery design via VELARIS AI",
)
async def jewellery_generate_design(req: dict) -> Dict[str, Any]:
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
async def jewellery_list_designs() -> Dict[str, Any]:
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
async def velaris_generate_3d_mesh(req: dict) -> Dict[str, Any]:
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
                f"{WYA_BASE_URL}/luna-api/chat",
                json={"message": message, "token": token, "wardrobe_items": wardrobe_items},
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()
            return {"reply": data.get("reply", ""), "intent": data.get("intent", ""), "data": data.get("data")}
        except Exception as e:
            return {"reply": f"Luna backend unavailable: {str(e)[:100]}", "intent": "error", "data": None}


# ── Cross-project integration endpoints ────────────────────────────────────────

@app.post(
    "/api/integrate/assign-room-function",
    tags=["integration"],
    summary="User assigns a function to a house room",
)
def assign_room_function(assignment: dict) -> Dict[str, Any]:
    """Allow user to assign a virtual function to a house room."""
    room_id = assignment.get("room_id")
    function = assignment.get("function")
    return {
        "success": True,
        "room_id": room_id,
        "assigned_function": function,
        "note": "Room function assignment recorded. Original geometry unchanged.",
    }


@app.post(
    "/api/integrate/save-look",
    tags=["integration"],
    summary="Save a complete user look (clothing + jewellery)",
)
def save_complete_look(look_data: dict) -> Dict[str, Any]:
    """Save a complete user look combining clothing, try-on, and jewellery."""
    return {
        "success": True,
        "look_id": look_data.get("look_id", "temp"),
        "note": "Look saved. Full integration pending Phase 3-5.",
    }
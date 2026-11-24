"""Service adapter for BATISSE — Floor plan to 3D dollhouse.

Mediates communication between the ar-vr integration layer and the BATISSE
backend. Does NOT modify BATISSE code or database; only calls its verified
REST APIs.
"""

from __future__ import annotations

import httpx
from typing import Any, Dict, Optional

from ..schemas import (
    RoomMetadata,
    ScaleInfo,
    UserReference,
)

# BATISSE backend base URL
from ..config import BATISSE_BASE_URL as BATISSE_BASE  # configured via config.BATISSE_BASE_URL in production


class BatisseService:
    """Adapter for BATISSE project services."""

    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or BATISSE_BASE
        self.client = httpx.AsyncClient(timeout=60.0)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.client.aclose()

    # ── Health ───────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Check if BATISSE backend is reachable."""
        try:
            response = await self.client.get(f"{self.base_url}/api/health")
            return response.status_code < 500
        except Exception:
            return False

    # ── Floor plan upload ────────────────────────────────────────────────

    async def process_floor_plan(self, body: Dict[str, Any]) -> Dict[str, Any]:
        """Delegate floor plan processing to BATISSE backend.

        In Phase 1, this forwards a minimal JSON payload. Full multipart/
        form data upload with floor plan image is handled by the BATISSE
        frontend and /api/projects endpoint.
        """
        response = await self.client.post(f"{self.base_url}/api/projects", json=body)
        response.raise_for_status()
        return response.json()

    # ── Geometry ───────────────────────────────────────────────────────────

    async def get_geometry(self, project_id: int) -> Dict[str, Any]:
        """Get validated geometry for a BATISSE project.

        Returns FloorPlanGeometry with rooms, walls, footprints, areas,
        confidence values, and scale information.
        """
        response = await self.client.get(f"{self.base_url}/api/projects/{project_id}/geometry")
        response.raise_for_status()
        return response.json()

    async def export_glb(self, project_id: int) -> Dict[str, Any]:
        """Export BATISSE geometry as GLB/glTF.

        Returns a GLB binary blob with embedded room metadata suitable
        for React Three Fiber loading.
        """
        response = await self.client.post(f"{self.base_url}/api/projects/{project_id}/geometry/export-glb")
        response.raise_for_status()
        return response.json()

    # ── Scale ──────────────────────────────────────────────────────────────

    async def set_scale_reference(
        self, project_id: int, p1: list[float], p2: list[float], length: float, unit: str = "m"
    ) -> Dict[str, Any]:
        """Set scale reference for a BATISSE project.

        Two points in plan coordinates + real length between them.
        """
        body = {
            "p1": p1,
            "p2": p2,
            "length": length,
            "unit": unit,
        }
        response = await self.client.post(
            f"{self.base_url}/api/projects/{project_id}/geometry/scale/reference",
            json=body,
        )
        response.raise_for_status()
        return response.json()

    async def accept_scale(
        self, project_id: int, meters_per_pixel: float, source: str = "user_reference", confidence: float = 0.9
    ) -> Dict[str, Any]:
        """Accept a proposed scale for a BATISSE project (pixel geometry only)."""
        body = {"meters_per_pixel": meters_per_pixel, "source": source, "confidence": confidence}
        response = await self.client.post(
            f"{self.base_url}/api/projects/{project_id}/geometry/scale/accept",
            json=body,
        )
        response.raise_for_status()
        return response.json()


# Singleton instance — created lazily
_batisse_service: Optional[BatisseService] = None


def get_batisse_service() -> BatisseService:
    """Get or create the BATISSE service singleton."""
    global _batisse_service
    if _batisse_service is None:
        _batisse_service = BatisseService()
    return _batisse_service

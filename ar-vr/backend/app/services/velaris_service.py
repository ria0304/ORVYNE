"""Service adapter for VELARIS — AI-powered jewellery design system.

Mediates communication between the ar-vr integration layer and the VELARIS
backend. Does NOT modify VELARIS code or database; only calls its verified
REST APIs.

Important: VELARIS currently outputs 2D design descriptions, classifications,
and PDF briefs. It does NOT produce 3D jewellery meshes. Phase 1 provides
2D design gallery browsing; 3D jewellery mesh generation is investigated
incrementally in later phases.
"""

from __future__ import annotations

import httpx
from typing import Any, Dict, List, Optional

from ..schemas import (
    AssetReference,
    AssetType,
    UserReference,
)

# VELARIS backend base URL
VELARIS_BASE = "http://127.0.0.1:8000"  # configured via config.VELARIS_BASE_URL in production


class VelarisService:
    """Adapter for VELARIS project services."""

    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or VELARIS_BASE
        self.client = httpx.AsyncClient(timeout=60.0)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.client.aclose()

    # ── Health ───────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Check if VELARIS backend is reachable."""
        try:
            await self.client.get(f"{self.base_url}/api/health")
            return True
        except Exception:
            return False

    # ── Design generation ─────────────────────────────────────────────────

    async def generate_design(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a jewellery design via VELARIS AI.

        Delegates to VELARIS /api/generate-design endpoint.
        Accepts text, sketch, or photo inputs and returns a design package
        with type, materials, gemstones, cost breakdown, and manufacturing specs.
        The output is currently 2D design description + PDF brief, not 3D mesh.
        """
        response = await self.client.post(f"{self.base_url}/api/generate-design", json=req)
        response.raise_for_status()
        return response.json()

    # ── Jewellery advisor ─────────────────────────────────────────────────

    async def jewellery_advisor(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Get gemstone recommendations and gifting advice from VELARIS."""
        response = await self.client.post(f"{self.base_url}/api/jewellery-advisor", json=req)
        response.raise_for_status()
        return response.json()

    # ── Design listing ────────────────────────────────────────────────────

    async def list_designs(self) -> Dict[str, Any]:
        """List available jewellery designs from VELARIS backend."""
        response = await self.client.get(f"{self.base_url}/api/trends")
        response.raise_for_status()
        return response.json()

    # ── Design classification ─────────────────────────────────────────────

    async def classify_type(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Classify a design type from sketch/photo via VELARIS."""
        response = await self.client.post(f"{self.base_url}/api/classify-type", json=req)
        response.raise_for_status()
        return response.json()

    # ── Similar designs ───────────────────────────────────────────────────

    async def find_similar(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Find similar jewellery designs via VELARIS."""
        response = await self.client.post(f"{self.base_url}/api/similar", json=req)
        response.raise_for_status()
        return response.json()


# Singleton instance — created lazily
_velaris_service: Optional[VelarisService] = None


def get_velaris_service() -> VelarisService:
    """Get or create the VELARIS service singleton."""
    global _velaris_service
    if _velaris_service is None:
        _velaris_service = VelarisService()
    return _velaris_service
"""Service adapter for TryOn — Virtual clothing try-on system.

Mediates communication between the ar-vr integration layer and the TryOn
backend. Does NOT modify TryOn code or database; only calls its verified
REST APIs.

Important: The existing TryOn pipeline is image-based only — it does NOT
support complete 3D garment simulation, avatar rigging, or cloth simulation.
Phase 1 provides image-based fitting previews; 3D garment pipeline is
investigated incrementally in later phases.
"""

from __future__ import annotations

import json
import httpx
from typing import Any, Dict, Optional, List

from ..schemas import (
    UserReference,
    AssetReference,
    AssetType,
)

# TryOn backend base URL
from ..config import TRYON_BASE_URL as TRYON_BASE  # configured via config.TRYON_BASE_URL in production


class TryOnService:
    """Adapter for TryOn project services."""

    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or TRYON_BASE
        self.client = httpx.AsyncClient(timeout=120.0)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.client.aclose()

    # ── Health ───────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Check if TryOn backend is reachable."""
        try:
            response = await self.client.get(f"{self.base_url}/api/health")
            return response.status_code < 500
        except Exception:
            return False

    # ── Authentication ────────────────────────────────────────────────────

    async def create_user(self) -> Dict[str, Any]:
        """Create a guest user in TryOn backend.

        TryOn uses guest-style auth with X-User-Id header; no password login.
        """
        response = await self.client.post(f"{self.base_url}/api/users")
        response.raise_for_status()
        return response.json()

    # ── Garments ───────────────────────────────────────────────────────────

    async def list_garments(self, user_id: str) -> Dict[str, Any]:
        """List user's garments from TryOn backend."""
        response = await self.client.get(f"{self.base_url}/api/garments", headers={"X-User-Id": user_id})
        response.raise_for_status()
        return response.json()

    async def upload_garment(self, user_id: str, file_data: Dict[str, Any]) -> Dict[str, Any]:
        """Upload a garment image to TryOn backend."""
        response = await self.client.post(f"{self.base_url}/api/uploads", headers={"X-User-Id": user_id}, data=file_data)
        response.raise_for_status()
        return response.json()

    # ── Try-on ────────────────────────────────────────────────────────────

    async def generate_tryon(
        self, garment_image_url: str, avatar: str, category: str, tryon_user_id: str
    ) -> Dict[str, Any]:
        """Image-based try-on: TryOn `POST /api/tryon` (X-User-Id = the user's TryOn guest id).

        TryOn dresses its own stand-in body; it takes no person photo. The
        result `url` is made absolute so the browser can display the image.
        """
        response = await self.client.post(
            f"{self.base_url}/api/tryon",
            headers={"X-User-Id": tryon_user_id},
            json={"avatar": avatar, "garmentImageUrl": garment_image_url, "category": category},
        )
        response.raise_for_status()
        data = response.json()
        url = data.get("url", "")
        if url.startswith("/"):
            data["url"] = f"{self.base_url}{url}"
        return data

    async def get_tryon_status(self) -> Dict[str, Any]:
        """Pipeline readiness: TryOn `GET /api/tryon/status` (no user needed)."""
        response = await self.client.get(f"{self.base_url}/api/tryon/status")
        response.raise_for_status()
        return response.json()

    # ── Asset reference ────────────────────────────────────────────────────

    async def get_garment_asset(self, garment_id: str, user_id: str) -> Dict[str, Any]:
        """Get garment asset reference from TryOn backend."""
        response = await self.client.get(
            f"{self.base_url}/api/garments/{garment_id}",
            headers={"X-User-Id": user_id},
        )
        response.raise_for_status()
        return response.json()


# Singleton instance — created lazily
_tryon_service: Optional[TryOnService] = None


def get_tryon_service() -> TryOnService:
    """Get or create the TryOn service singleton."""
    global _tryon_service
    if _tryon_service is None:
        _tryon_service = TryOnService()
    return _tryon_service

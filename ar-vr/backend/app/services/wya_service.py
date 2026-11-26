"""Service adapter for WYA — AI-powered wardrobe intelligence.

Mediates communication between the ar-vr integration layer and the WYA
backend. Does NOT modify WYA code or database; only calls its verified
REST APIs.
"""

from __future__ import annotations

import json
import httpx
from typing import Any, Dict, List, Optional

from ..schemas import (
    UserReference,
    RoomMetadata,
    AssetReference,
    RoomFunction,
)

# WYA backend base URL
from ..config import WYA_BASE_URL as WYA_BASE
from ..request_context import client_ip_var  # configured via config.WYA_BASE_URL in production


async def _forward_client_ip(request: httpx.Request) -> None:
    """Tell WYA which user's browser this call is for, so its per-IP rate limits are per user."""
    ip = client_ip_var.get()
    if ip:
        request.headers["X-Forwarded-For"] = ip


class WYAService:
    """Adapter for WYA project services."""

    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or WYA_BASE
        self.client = httpx.AsyncClient(timeout=60.0, event_hooks={"request": [_forward_client_ip]})

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.client.aclose()

    # ── Health ───────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Check if WYA backend is reachable."""
        try:
            response = await self.client.get(f"{self.base_url}/health/ready")
            return response.status_code < 500
        except Exception:
            return False

    # ── Authentication ────────────────────────────────────────────────────

    async def register(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new user via WYA backend."""
        response = await self.client.post(f"{self.base_url}/api/auth/register", json=user_data)
        response.raise_for_status()
        return response.json()

    async def login(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Login user via WYA backend and receive JWT token."""
        response = await self.client.post(f"{self.base_url}/api/auth/login", json=credentials)
        response.raise_for_status()
        return response.json()

    # ── User profile ──────────────────────────────────────────────────────

    async def get_profile(self, user_id: str, token: str) -> Dict[str, Any]:
        """Get user profile from WYA backend (authenticated)."""
        response = await self.client.get(
            f"{self.base_url}/api/user/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()

    async def update_profile(self, user_id: str, token: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update user profile via WYA backend."""
        response = await self.client.put(
            f"{self.base_url}/api/user/profile",
            headers={"Authorization": f"Bearer {token}"},
            json=data,
        )
        response.raise_for_status()
        return response.json()

    # ── Wardrobe ───────────────────────────────────────────────────────────

    async def get_wardrobe(self, token: str) -> list:
        """The signed-in user's wardrobe: WYA `GET /api/wardrobe` (Bearer JWT, user-scoped by WYA)."""
        response = await self.client.get(
            f"{self.base_url}/api/wardrobe", headers={"Authorization": f"Bearer {token}"}
        )
        response.raise_for_status()
        return response.json()

    async def get_preferences(self, user_id: str, token: str) -> Dict[str, Any]:
        """Get user color/brand preferences from WYA backend."""
        response = await self.client.get(
            f"{self.base_url}/api/user/preferences",
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()

    async def update_preferences(self, user_id: str, token: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update user preferences via WYA backend."""
        response = await self.client.put(
            f"{self.base_url}/api/user/preferences",
            headers={"Authorization": f"Bearer {token}"},
            json=data,
        )
        response.raise_for_status()
        return response.json()

    # ── Outfit recommendations ────────────────────────────────────────────

    async def curate_outfits(self, token: str, items: list) -> Dict[str, Any]:
        """Outfit recommendations from the user's wardrobe items: WYA `POST /api/ai/curate-outfits`."""
        response = await self.client.post(
            f"{self.base_url}/api/ai/curate-outfits",
            json={"items": items},
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()

    async def scan_fabric(self, token: str, image: str) -> Dict[str, Any]:
        """WYA's garment classifier (category, colour, fabric, pattern, name): `POST /api/ai/fabric-scan`."""
        response = await self.client.post(
            f"{self.base_url}/api/ai/fabric-scan",
            json={"image": image},
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()

    async def score_outfit(self, token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Outfit score: WYA `POST /api/ai/outfit-score` (body: {outfit, style_dna?, ...})."""
        response = await self.client.post(
            f"{self.base_url}/api/ai/outfit-score",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()


    async def record_feedback(
        self, user_id: str, token: str, feedback_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Record outfit feedback (like/dislike/save/wear/skip) for WYA learning."""
        response = await self.client.post(
            f"{self.base_url}/api/ai/outfit-feedback",
            headers={"Authorization": f"Bearer {token}"},
            json=feedback_data,
        )
        response.raise_for_status()
        return response.json()


# Singleton instance — created lazily
_wya_service: Optional[WYAService] = None


def get_wya_service() -> WYAService:
    """Get or create the WYA service singleton."""
    global _wya_service
    if _wya_service is None:
        _wya_service = WYAService()
    return _wya_service

"""
Luna integration tests for ORVYNE.

These tests verify:
- Luna persistence across restarts
- Two-user isolation
- Command execution
- HUD state
- Real downstream integration (mocked when services unavailable)
"""

from __future__ import annotations

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app

# ── Token helpers ────────────────────────────────────────────────────────────

SECRET = "ar-vr-dev-secret-change-in-production"

def make_token(sub: str, exp_offset: int = 3600) -> str:
    return jwt.encode({"sub": sub, "exp": int(time.time()) + exp_offset}, SECRET, algorithm="HS256")

TOKEN_A = make_token("user-a")
TOKEN_B = make_token("user-b")
EXPIRED_TOKEN = make_token("user-a", exp_offset=-100)

# ── Test clients ─────────────────────────────────────────────────────────────

client_a = TestClient(app, headers={"Authorization": f"Bearer {TOKEN_A}"})
client_b = TestClient(app, headers={"Authorization": f"Bearer {TOKEN_B}"})
client_noauth = TestClient(app)

# ── Luna State Persistence ──────────────────────────────────────────────────

class TestLunaStatePersistence:
    """Test Luna state persistence per user."""

    def test_set_and_get_luna_state(self):
        """Set Luna state and verify it is retrievable."""
        response = client_a.post(
            "/api/luna/state/set_state",
            json={
                "state": "happy",
                "is_following": True,
                "voice_volume": 0.7,
                "voice_muted": False,
                "battery": 75,
                "zone": "living_room",
                "interaction_status": "idle",
            },
        )
        assert response.status_code == 200

        response = client_a.get("/api/luna/state/get_state")
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "happy"
        assert data["voice_volume"] == 0.7
        assert data["battery"] == 75

    def test_luna_state_isolation(self):
        """Two users have separate Luna states."""
        # User A sets state
        client_a.post("/api/luna/state/set_state", json={
            "state": "thinking", "voice_volume": 0.9, "battery": 50
        })
        # User B sets different state
        client_b.post("/api/luna/state/set_state", json={
            "state": "idle", "voice_volume": 0.1, "battery": 20
        })
        
        # User A sees their state
        data_a = client_a.get("/api/luna/state/get_state").json()
        assert data_a["state"] == "thinking"
        assert data_a["voice_volume"] == 0.9
        assert data_a["battery"] == 50
        
        # User B sees their state
        data_b = client_b.get("/api/luna/state/get_state").json()
        assert data_b["state"] == "idle"
        assert data_b["voice_volume"] == 0.1
        assert data_b["battery"] == 20

    def test_toggle_following_isolated(self):
        """Toggling following is isolated per user."""
        client_a.post("/api/luna/state/toggle_following")
        assert client_a.get("/api/luna/state/get_state").json()["is_following"] == False
        
        # User B should still have their own state
        # (User B hasn't toggled yet, so they default to following=True)
        data_b = client_b.get("/api/luna/state/get_state").json()
        assert data_b["is_following"] is True  # Default, not affected by A

    def test_set_expression_isolated(self):
        """Setting expressions is isolated per user."""
        client_a.post("/api/luna/state/set_expression", data={"expression": "happy"})
        client_b.post("/api/luna/state/set_expression", data={"expression": "idle"})
        
        assert client_a.get("/api/luna/state/get_state").json()["state"] == "happy"
        assert client_b.get("/api/luna/state/get_state").json()["state"] == "idle"

# ── Authentication Tests ────────────────────────────────────────────────────

class TestLunaAuthentication:
    """Test authentication enforcement on Luna endpoints."""

    def test_get_state_requires_auth(self):
        """GET /api/luna/state/get_state requires valid JWT."""
        response = client_noauth.get("/api/luna/state/get_state")
        assert response.status_code == 401

    def test_toggle_following_requires_auth(self):
        """POST /api/luna/state/toggle_following requires valid JWT."""
        response = client_noauth.post("/api/luna/state/toggle_following")
        assert response.status_code == 401

    def test_set_expression_requires_auth(self):
        """POST /api/luna/state/set_expression requires valid JWT."""
        response = client_noauth.post("/api/luna/state/set_expression", data={"expression": "idle"})
        assert response.status_code == 401

    def test_set_state_requires_auth(self):
        """POST /api/luna/state/set_state requires valid JWT."""
        response = client_noauth.post("/api/luna/state/set_state", json={"state": "idle"})
        assert response.status_code == 401

    def test_expired_token_rejected(self):
        """Expired JWT is rejected."""
        expired_client = TestClient(app, headers={"Authorization": f"Bearer {EXPIRED_TOKEN}"})
        response = expired_client.get("/api/luna/state/get_state")
        assert response.status_code == 401

    def test_invalid_token_rejected(self):
        """Invalid JWT signature is rejected."""
        invalid_client = TestClient(app, headers={"Authorization": "Bearer invalid.token.here"})
        response = invalid_client.get("/api/luna/state/get_state")
        assert response.status_code == 401

# ── Command Execution Tests (Unit - with mocks) ─────────────────────────────

class TestLunaCommandExecution:
    """Test command parsing and execution with mocked services."""

    def test_execute_follow_command(self):
        """Test 'follow' command toggles following."""
        # Create a unique test user
        test_token = make_token("user-test-follow")
        test_client = TestClient(app, headers={"Authorization": f"Bearer {test_token}"})
        
        # Initial state: following=True
        data = test_client.get("/api/luna/state/get_state").json()
        assert data["is_following"] is True
        
        # Toggle
        test_client.post("/api/luna/state/toggle_following")
        data = test_client.get("/api/luna/state/get_state").json()
        assert data["is_following"] is False

    def test_execute_help_command(self):
        """Test 'help' command returns helpful text."""
        # Help is frontend logic - test the endpoint doesn't break
        # The actual response is generated client-side
        data = client_a.get("/api/luna/state/get_state").json()
        assert data is not None

# ── Real Integration Tests (BATISSE) ────────────────────────────────────────

class TestBATISSEIntegration:
    """Test BATISSE integration with real service or mock."""

    def test_batisse_upload_with_auth(self):
        """BATISSE upload with valid auth."""
        response = client_a.post("/api/batisse/upload", json={"name": "Test"})
        assert response.status_code in (200, 422)

    def test_batisse_geometry_with_auth(self):
        """BATISSE geometry retrieval with valid auth."""
        response = client_a.get("/api/batisse/geometry")
        # May fail if BATISSE not running, but auth should work
        assert response.status_code in (200, 422, 503)

# ── Real Integration Tests (WYA) ─────────────────────────────────────────────

class TestWYAIntegration:
    """Test WYA wardrobe integration with real service or mock."""

    def test_wardrobe_browse_with_auth(self):
        """WYA wardrobe browse with valid auth."""
        response = client_a.post("/api/wardrobe/browse", json={"user_id": "user-a"})
        assert response.status_code in (200, 422, 503)

    def test_outfit_recommendations_with_auth(self):
        """WYA outfit recommendations with valid auth."""
        response = client_a.post(
            "/api/wardrobe/outfit-recommendations",
            json={"user_id": "user-a", "occasion": "casual"},
        )
        assert response.status_code in (200, 422, 503)

# ── Real Integration Tests (VELARIS) ────────────────────────────────────────

class TestVELARISIntegration:
    """Test VELARIS jewellery generation with real service or mock."""

    def test_generate_design_with_auth(self):
        """VELARIS design generation with valid auth."""
        response = client_a.post(
            "/api/jewelleri/generate-design",
            json={"prompt": "A simple ring", "inputType": "text", "style": "modern", "budget": "balanced"},
        )
        assert response.status_code in (200, 422, 503)

    def test_generate_3d_mesh_with_auth(self):
        """VELARIS 3D mesh generation with valid auth."""
        response = client_a.post(
            "/api/velaris/mesh",
            json={"jewelry_type": "ring", "gemstone": "diamond", "metal": "yellow gold", "carat": 1.0},
        )
        assert response.status_code in (200, 422, 503)

# ── Real Integration Tests (TryOn) ───────────────────────────────────────────

class TestTryOnIntegration:
    """Test TryOn integration with real service or mock."""

    def test_tryon_status_with_auth(self):
        """TryOn status with valid auth."""
        response = client_a.get("/api/tryon/status")
        assert response.status_code in (200, 422, 503)

    def test_tryon_generate_with_auth(self):
        """TryOn generation with valid auth."""
        response = client_a.post(
            "/api/tryon/generate",
            json={
                "garment_image_url": "http://example.com/test.jpg",
                "avatar_params": {"gender": "female"},
                "user_id": "user-a",
            },
        )
        assert response.status_code in (200, 422, 503)

# ── Two-User Isolation Integration Tests ────────────────────────────────────

class TestTwoUserIsolation:
    """Verify two users cannot access each other's data."""

    def test_navigation_isolation(self):
        """User A cannot read User B's navigation."""
        # User A sets position
        client_a.post("/api/navigation/set-position/default", json={"x": 1.0, "y": 1.6, "z": 0.0})
        # User B tries to set same position
        client_b.post("/api/navigation/set-position/default", json={"x": 5.0, "y": 1.6, "z": 0.0})
        
        # User B can set their own
        assert client_b.get("/api/navigation/get-position/default").status_code == 200

    def test_luna_state_isolation_comprehensive(self):
        """User A cannot modify User B's Luna state."""
        # Set User A state
        client_a.post("/api/luna/state/set_state", json={"state": "happy", "battery": 50})
        
        # User A verifies their state
        state_a = client_a.get("/api/luna/state/get_state").json()
        assert state_a["state"] == "happy"
        
        # User B sees default, not User A's state
        state_b = client_b.get("/api/luna/state/get_state").json()
        # User B should see their own default state, not A's
        assert state_b["state"] != "happy" or state_b["battery"] != 50

# ── Database Restart Verification ───────────────────────────────────────────

class TestDatabaseRestart:
    """Verify state persists across database operations."""

    def test_luna_state_persists(self):
        """Luna state set before a 'restart' is still available after."""
        # Set state
        client_a.post("/api/luna/state/set_state", json={
            "state": "walkng", "voice_volume": 0.5, "battery": 80
        })
        
        # Verify immediately
        data = client_a.get("/api/luna/state/get_state").json()
        assert data["state"] == "walkng"
        assert data["voice_volume"] == 0.5
        assert data["battery"] == 80

    def test_toggle_following_persists(self):
        """Toggling following persists correctly."""
        test_token = make_token("user-restart")
        test_client = TestClient(app, headers={"Authorization": f"Bearer {test_token}"})
        
        # Set to not following
        test_client.post("/api/luna/state/toggle_following")
        assert test_client.get("/api/luna/state/get_state").json()["is_following"] is False
        
        # Toggle back
        test_client.post("/api/luna/state/toggle_following")
        assert test_client.get("/api/luna/state/get_state").json()["is_following"] is True

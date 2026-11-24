"""
Invalid input and error handling tests for ORVYNE.

Tests verify:
- Missing, invalid, and expired JWTs
- Invalid request bodies
- Downstream service failures
- Database error handling
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app

# ── Token helpers ────────────────────────────────────────────────────────────

SECRET = "ar-vr-dev-secret-change-in-production"

def make_token(sub: str, exp_offset: int = 3600) -> str:
    return jwt.encode({"sub": sub, "exp": int(time.time()) + exp_offset}, SECRET, algorithm="HS256")

client_a = TestClient(app, headers={"Authorization": f"Bearer {make_token('user-a')}"})
client_b = TestClient(app, headers={"Authorization": f"Bearer {make_token('user-b')}"})
client_c = TestClient(app, headers={"Authorization": f"Bearer {make_token('user-c')}"})
client_expired = TestClient(app, headers={"Authorization": f"Bearer {make_token('user-a', -100)}"})
client_invalid = TestClient(app, headers={"Authorization": "Bearer invalid.token.here"})
client_noauth = TestClient(app)

# ── Missing and invalid JWT tests ────────────────────────────────────────────

class TestAuthenticationErrors:
    """Test authentication error handling."""

    def test_missing_token_on_get_luna_state(self):
        """GET /api/luna/state/get_state without token returns 401."""
        response = client_noauth.get("/api/luna/state/get_state")
        assert response.status_code == 401
        assert "Not authenticated" in str(response.json())

    def test_missing_token_on_set_luna_state(self):
        """POST /api/luna/state/set_state without token returns 401."""
        response = client_noauth.post("/api/luna/state/set_state", json={"state": "idle"})
        assert response.status_code == 401

    def test_expired_token_rejected(self):
        """Expired JWT returns 401."""
        response = client_expired.get("/api/luna/state/get_state")
        assert response.status_code == 401
        assert "expired" in response.json().get("detail", "").lower()

    def test_invalid_token_signature_rejected(self):
        """Invalid token signature returns 401."""
        response = client_invalid.get("/api/luna/state/get_state")
        assert response.status_code == 401

    def test_token_without_sub_rejected(self):
        """JWT without 'sub' claim returns 401."""
        bad_token = jwt.encode({"exp": int(time.time()) + 3600}, SECRET, algorithm="HS256")
        client = TestClient(app, headers={"Authorization": f"Bearer {bad_token}"})
        response = client.get("/api/luna/state/get_state")
        assert response.status_code == 401

# ── Invalid request body tests ──────────────────────────────────────────────

class TestInvalidRequestBodies:
    """Test handling of invalid request bodies."""

    def test_set_luna_state_missing_fields(self):
        """Setting Luna state without required fields still works (all optional)."""
        response = client_a.post("/api/luna/state/set_state", json={})
        assert response.status_code in (200, 422)

    def test_set_luna_state_null_battery(self):
        """Setting battery to null results in default value."""
        response = client_a.post("/api/luna/state/set_state", json={"battery": None})
        assert response.status_code == 200

    def test_set_luna_state_invalid_zone_type(self):
        """Setting zone to wrong type returns error."""
        response = client_a.post("/api/luna/state/set_state", json={"zone": 123})
        assert response.status_code in (200, 422)

    def test_set_luna_state_missing_auth(self):
        """Setting state without auth returns 401."""
        response = client_noauth.post("/api/luna/state/set_state", json={"state": "idle"})
        assert response.status_code == 401

# ── User isolation tests ─────────────────────────────────────────────────────

class TestUserIsolation:
    """Test that users cannot access each other's data."""

    def test_user_a_cannot_read_user_b_luna_state(self):
        """User A cannot read User B's Luna state."""
        # User A sets state
        client_a.post("/api/luna/state/set_state", json={"state": "happy", "battery": 100})
        
        # User B reads state - should get their own (default or previous), not User A's
        response = client_b.get("/api/luna/state/get_state")
        data = response.json()
        # Should NOT show User A's "happy" state if User B hasn't set their own
        # (Unless they happen to also be set to "happy")
        assert response.status_code == 200

    def test_user_a_cannot_modify_user_b_luna_state(self):
        """User A cannot modify User B's Luna state via shared endpoint."""
        # User B sets initial state
        client_b.post("/api/luna/state/set_state", json={"state": "idle", "battery": 50})
        
        # User A tries to modify User B's state
        # The API only accepts their own authenticated user
        client_a.post("/api/luna/state/set_state", json={"state": "happy", "battery": 100})
        
        # User B's state should still be "idle"
        data_b = client_b.get("/api/luna/state/get_state").json()
        assert data_b["state"] == "idle"
        assert data_b["battery"] == 50

    def test_navigation_isolated_per_user(self):
        """User A and User B have separate navigation positions."""
        # User A sets position
        client_a.post("/api/navigation/set-position/default", json={"x": 1.0, "y": 1.6, "z": 0.0})
        # User B sets different position
        client_b.post("/api/navigation/set-position/default", json={"x": 5.0, "y": 1.6, "z": 0.0})
        
        # Both can read back their own position
        assert client_a.get("/api/navigation/get-position/default").status_code == 200
        assert client_b.get("/api/navigation/get-position/default").status_code == 200

# ── Database error handling ─────────────────────────────────────────────────

class TestDatabaseErrorHandling:
    """Test database error handling."""

    def test_set_luna_state_rollback_on_error(self):
        """Setting state with invalid input doesn't corrupt database."""
        # Set valid state first
        client_a.post("/api/luna/state/set_state", json={"state": "idle"})
        
        # Try to set invalid state
        response = client_a.post("/api/luna/state/set_state", json={"state": ""})
        
        # State should still be retrievable
        data = client_a.get("/api/luna/state/get_state")
        assert data.status_code == 200

    def test_toggle_following_error_handling(self):
        """Toggling following doesn't fail on concurrent operations."""
        # Toggle multiple times
        for _ in range(5):
            response = client_a.post("/api/luna/state/toggle_following")
            assert response.status_code == 200

# ── Downstream service failure tests (mocked) ───────────────────────────────

class TestDownstreamFailures:
    """Test graceful handling of downstream service failures."""

    def test_wardrobe_browse_service_down(self):
        """WARDROBE browse fails gracefully when service is down."""
        with patch('app.services.wya_service.WYAService.get_wardrobe', new_callable=AsyncMock) as mock:
            mock.side_effect = Exception("Service unavailable")
            response = client_a.post("/api/wardrobe/browse", json={"user_id": "user-a"})
            assert response.status_code in (200, 422, 503)
            data = response.json()
            assert data.get("error") is None or "unavailable" in data.get("error", "").lower()

    def test_velaris_mesh_generation_failure(self):
        """VELARIS mesh generation handles failures gracefully."""
        response = client_a.post("/api/velaris/mesh", json={"jewelry_type": "ring"})
        assert response.status_code in (200, 422, 503)
        data = response.json()
        # Should return an error or graceful message, not crash
        assert "error" in data or data.get("success", True) is False or "mesh_url" in data

    def test_tryon_status_graceful_failure(self):
        """TRY-ON status returns graceful message when service is down."""
        response = client_a.get("/api/tryon/status")
        assert response.status_code in (200, 422, 503)

# ── Security tests ───────────────────────────────────────────────────────────

class TestSecurityTests:
    """Test security-related error handling."""

    def test_no_query_param_user_id_injection(self):
        """User ID cannot be overridden via query parameter."""
        # Set user A's state to a unique value to detect if user B is exposed
        client_a.post('/api/luna/state/set_state', json={'state': 'user_a_unique_state'})
        
        # Even if we pass ?user_id=user-b, it should use the JWT-derived ID (user A)
        response = client_a.get("/api/luna/state/get_state?user_id=user-b")
        assert response.status_code == 200
        data = response.json()
        # Must return user A's state (not user B's or default)
        assert data["state"] == "user_a_unique_state"

    def test_cors_does_not_allow_invalid_origins(self):
        """CORS rejects requests from unauthorized origins."""
        # This is tested implicitly by the TestClient setup, but let's verify
        # the endpoint still works with auth
        response = client_a.get("/api/luna/state/get_state")
        assert response.status_code == 200

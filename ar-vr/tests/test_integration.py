"""Integration tests for the ar-vr integration layer.

Tests verify the integration backend routes requests correctly and
has the expected structure. Service adapter mocking uses a simpler
approach.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from fastapi.testclient import TestClient

from app.main import app

# ── Test client ────────────────────────────────────────────────────────────────

client = TestClient(app)


# ── Health endpoint ───────────────────────────────────────────────────────────

class TestHealth:
    """Test the /api/health endpoint."""

    def test_health_returns_ok(self):
        """Health endpoint returns 200 with status ok."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "services" in data
        assert isinstance(data["services"], dict)
        for service_name in ["batisse", "wya", "tryon", "velaris"]:
            assert service_name in data["services"]

    def test_health_services_structure(self):
        """Health response has correct service structure."""
        response = client.get("/api/health")
        data = response.json()
        services = data["services"]
        expected_services = {"batisse", "wya", "tryon", "velaris"}
        assert set(services.keys()) == expected_services
        for svc in services.values():
            assert svc in ("ok", "unreachable")


# ── BATISSE endpoints ──────────────────────────────────────────────────────────

class TestBatisseEndpoints:
    """Test BATISSE integration endpoints."""

    def test_batisse_upload_accepted(self):
        """BATISSE upload endpoint accepts POST requests."""
        response = client.post(
            "/api/batisse/upload",
            json={"name": "Test Plan", "description": "A test floor plan"},
        )
        # In Phase 1, this returns a structured response
        assert response.status_code in (200, 422)  # 422 if validation fails, 200 if OK

    def test_batisse_get_geometry_requires_id(self):
        """BATISSE geometry endpoint requires project ID."""
        response = client.get("/api/batisse/projects/1/geometry")
        assert response.status_code == 200

    def test_batisse_export_glb_requires_id(self):
        """BATISSE GLB export endpoint requires project ID."""
        response = client.post("/api/batisse/projects/1/geometry/export-glb")
        assert response.status_code in (200, 422)


# ── WYA endpoints ──────────────────────────────────────────────────────────────

class TestWYAEndpoints:
    """Test WYA integration endpoints."""

    def test_wardrobe_browse_accepts_post(self):
        """WARDROBE browse endpoint accepts POST with user_id."""
        response = client.post("/api/wardrobe/browse", json={"user_id": "user-123"})
        assert response.status_code in (200, 422)

    def test_outfit_recommendations_accepts_post(self):
        """OUTFIT recommendations endpoint accepts POST."""
        response = client.post(
            "/api/wardrobe/outfit-recommendations",
            json={"user_id": "user-123", "occasion": "casual"},
        )
        assert response.status_code in (200, 422)


# ── TryOn endpoints ───────────────────────────────────────────────────────────

class TestTryOnEndpoints:
    """Test TryOn integration endpoints."""

    def test_tryon_generate_accepts_post(self):
        """TRY-ON generate endpoint accepts POST."""
        response = client.post(
            "/api/tryon/generate",
            json={
                "garment_image_url": "http://example.com/garment.jpg",
                "avatar_params": {"gender": "female"},
                "user_id": "user-123",
            },
        )
        assert response.status_code in (200, 422)

    def test_tryon_status_get(self):
        """TRY-ON status endpoint accepts GET."""
        response = client.get("/api/tryon/status")
        assert response.status_code in (200, 422)


# ── VELARIS endpoints ─────────────────────────────────────────────────────────

class TestVELARISEndpoints:
    """Test VELARIS integration endpoints."""

    def test_generate_design_accepts_post(self):
        """VELARIS generate-design endpoint accepts POST."""
        response = client.post(
            "/api/jewellery/generate-design",
            json={
                "prompt": "A simple ring",
                "inputType": "text",
                "style": "Contemporary Minimalist",
                "budget": "Balanced",
            },
        )
        assert response.status_code in (200, 422)

    def test_list_designs_get(self):
        """VELARIS list-designs endpoint accepts GET."""
        response = client.get("/api/jewellery/designs")
        assert response.status_code in (200, 422)


# ── Cross-project integration endpoints ───────────────────────────────────────

class TestIntegrationEndpoints:
    """Test cross-project integration endpoints."""

    def test_assign_room_function(self):
        """Room function assignment endpoint."""
        response = client.post(
            "/api/integrate/assign-room-function",
            json={"room_id": "room-living-1", "function": "living_room"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["room_id"] == "room-living-1"
        assert data["assigned_function"] == "living_room"

    def test_save_complete_look(self):
        """Save complete look endpoint."""
        response = client.post(
            "/api/integrate/save-look",
            json={"look_id": "look-001", "clothing_items": ["Shirt"], "jewellery_item": "Ring"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["look_id"] == "look-001"


# ── Service import tests ──────────────────────────────────────────────────────

class TestServiceImports:
    """Test that service modules can be imported."""

    def test_batisse_service_module_importable(self):
        """BATISSE service module can be imported."""
        from app.services import batisse_service
        assert batisse_service is not None

    def test_wya_service_module_importable(self):
        """WYA service module can be imported."""
        from app.services import wya_service
        assert wya_service is not None

    def test_tryon_service_module_importable(self):
        """TryOn service module can be imported."""
        from app.services import tryon_service
        assert tryon_service is not None

    def test_velaris_service_module_importable(self):
        """VELARIS service module can be imported."""
        from app.services import velaris_service
        assert velaris_service is not None


# ── Schema tests ──────────────────────────────────────────────────────────────

class TestSchemas:
    """Test shared Pydantic schemas."""

    def test_integration_health_schema(self):
        """IntegrationHealth schema can be instantiated."""
        from app.schemas import IntegrationHealth
        health = IntegrationHealth(services={"batisse": "ok"})
        assert health.status == "ok"

    def test_user_reference_schema(self):
        """UserReference schema works correctly."""
        from app.schemas import UserReference
        ur = UserReference(user_id="user-123", username="testuser")
        assert ur.user_id == "user-123"
        assert ur.username == "testuser"

    def test_room_metadata_schema(self):
        """RoomMetadata schema works correctly."""
        from app.schemas import RoomMetadata
        rm = RoomMetadata(
            room_id="rm-001",
            room_name="Living Room",
            room_function="living_room",
            polygon=[[0, 0], [1, 0], [1, 1], [0, 1]],
        )
        assert rm.room_id == "rm-001"
        assert rm.room_name == "Living Room"
        assert rm.room_function == "living_room"

    def test_asset_reference_schema(self):
        """AssetReference schema works correctly."""
        from app.schemas import AssetReference
        ar = AssetReference(
            asset_id="asset-001",
            asset_type="house",
            name="Test House",
        )
        assert ar.asset_id == "asset-001"
        assert ar.asset_type == "house"
        assert ar.name == "Test House"

    def test_scale_info_schema(self):
        """ScaleInfo schema works correctly."""
        from app.schemas import ScaleInfo
        si = ScaleInfo(units="m", meters_per_pixel=0.001)
        assert si.units == "m"
        assert si.meters_per_pixel == 0.001

    def test_room_assignment_schema(self):
        """RoomAssignment schema works correctly."""
        from app.schemas import RoomAssignment
        ra = RoomAssignment(room_id="rm-001", room_name="Bedroom", assigned_function="bedroom")
        assert ra.room_id == "rm-001"
        assert ra.assigned_function == "bedroom"
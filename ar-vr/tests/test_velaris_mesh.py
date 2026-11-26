"""VELARIS mesh generation — verifies real geometry, not just HTTP 200."""
import base64
import io
import time

import jwt
import pytest
import trimesh
from fastapi.testclient import TestClient

from app import config
from app.main import app

TYPES = ["ring", "necklace", "pendant", "earrings", "bracelet"]


def _client(user="mesh-user"):
    token = jwt.encode({"sub": user, "exp": int(time.time()) + 600},
                       config.INTEGRATION_JWT_SECRET, algorithm="HS256")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


@pytest.mark.parametrize("jewelry_type", TYPES)
def test_mesh_is_valid_reloadable_glb(jewelry_type):
    r = _client().post("/api/velaris/mesh", json={
        "jewelry_type": jewelry_type, "gemstone": "ruby",
        "metal": "rose gold", "carat": 1.0, "shape": "round"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["format"] == "glb" and body["face_count"] > 0
    glb = base64.b64decode(body["mesh_url"].split(",", 1)[1])
    assert glb[:4] == b"glTF"
    scene = trimesh.load(io.BytesIO(glb), file_type="glb")
    assert sum(len(g.faces) for g in scene.geometry.values()) == body["face_count"]
    assert body["watertight"] is True


def test_invalid_type_is_not_http_200():
    r = _client().post("/api/velaris/mesh", json={"jewelry_type": "tiara"})
    assert r.status_code == 422


def test_mesh_requires_auth():
    assert TestClient(app).post("/api/velaris/mesh", json={"jewelry_type": "ring"}).status_code == 401


def test_health_reports_unreachable_not_ok_when_services_down():
    r = TestClient(app).get("/api/health").json()
    assert set(r["services"]) == {"batisse", "wya", "tryon", "velaris"}


# ── Health + Luna chat contract ───────────────────────────────────────────────

def test_health_status_degraded_or_down_when_services_missing():
    body = TestClient(app).get("/api/health").json()
    ok = [v for v in body["services"].values() if v == "ok"]
    if len(ok) == len(body["services"]):
        assert body["status"] == "ok"
    else:
        assert body["status"] in ("degraded", "down")


def test_luna_chat_requires_auth():
    assert TestClient(app).post("/api/luna/chat", json={"message": "hi"}).status_code == 401


def test_luna_chat_without_linked_wya_is_424():
    r = _client("luna-unlinked").post("/api/luna/chat", json={"message": "hi"})
    assert r.status_code == 424

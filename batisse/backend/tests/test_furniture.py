"""Furniture asset / instance / scene-configuration API tests."""
from __future__ import annotations

import io


def test_model_import_and_serve(client):
    # invalid extension
    r = client.post("/api/furniture/assets/import", files={"file": ("x.txt", io.BytesIO(b"hi"), "text/plain")})
    assert r.status_code == 415

    # valid glb (minimal header)
    glb = b"glTF" + b"\x00" * 20
    r = client.post("/api/furniture/assets/import", files={"file": ("chair.glb", io.BytesIO(glb), "model/gltf-binary")}, data={"name": "Chair GLB", "category": "chair"})
    assert r.status_code == 201, r.text
    asset = r.json()
    assert asset["name"] == "Chair GLB"
    assert asset["model_path"]
    aid = asset["id"]

    # serve model
    r = client.get(f"/api/furniture/assets/{aid}/model")
    assert r.status_code == 200
    assert r.content[:4] == b"glTF"

    # invalid gltf external deps
    bad = '{"asset":{"version":"2.0"},"buffers":[{"uri":"buf.bin"}]}'
    r = client.post("/api/furniture/assets/import", files={"file": ("x.gltf", io.BytesIO(bad.encode()), "model/gltf+json")})
    assert r.status_code == 422

    # self-contained gltf accepted
    good = '{"asset":{"version":"2.0"},"buffers":[{"uri":"data:application/octet-stream;base64,AAAA"}]}'
    r = client.post("/api/furniture/assets/import", files={"file": ("y.gltf", io.BytesIO(good.encode()), "application/json")})
    assert r.status_code == 201
    aid2 = r.json()["id"]

    # delete cleans up
    r = client.delete(f"/api/furniture/assets/{aid}")
    assert r.status_code == 204
    r = client.get(f"/api/furniture/assets/{aid}/model")
    assert r.status_code == 404


def test_asset_crud(client):
    r = client.post("/api/furniture/assets", json={"name": "Sofa", "category": "sofa", "width": 2.0, "height": 0.9, "depth": 0.9})
    assert r.status_code == 201
    asset = r.json()
    assert asset["name"] == "Sofa"
    aid = asset["id"]

    r = client.get(f"/api/furniture/assets/{aid}")
    assert r.status_code == 200
    assert r.json()["id"] == aid

    r = client.get("/api/furniture/assets")
    assert r.status_code == 200
    assert any(a["id"] == aid for a in r.json())

    r = client.patch(f"/api/furniture/assets/{aid}", json={"name": "Big Sofa", "width": 2.2})
    assert r.status_code == 200
    assert r.json()["name"] == "Big Sofa"
    assert r.json()["width"] == 2.2

    r = client.delete(f"/api/furniture/assets/{aid}")
    assert r.status_code == 204
    r = client.get(f"/api/furniture/assets/{aid}")
    assert r.status_code == 404


def test_instance_independence(client, project):
    # create one asset
    r = client.post("/api/furniture/assets", json={"name": "Chair", "category": "chair"})
    asset_id = r.json()["id"]
    pid = project["id"]

    # place in project A
    r = client.post("/api/furniture/instances", json={"asset_id": asset_id, "project_id": pid, "pos_x": 1.0, "pos_y": 0.0, "pos_z": 2.0})
    assert r.status_code == 201
    inst1 = r.json()
    iid1 = inst1["id"]

    # create second project
    r = client.post("/api/projects", json={"name": "House B"})
    pid2 = r.json()["id"]
    r = client.post("/api/furniture/instances", json={"asset_id": asset_id, "project_id": pid2, "pos_x": 5.0, "pos_y": 0.0, "pos_z": 6.0})
    assert r.status_code == 201
    inst2 = r.json()

    # move instance in project A
    r = client.patch(f"/api/furniture/instances/{iid1}", json={"pos_x": 9.0})
    assert r.status_code == 200
    assert r.json()["pos_x"] == 9.0

    # instance in project B unchanged
    r = client.get(f"/api/furniture/instances/{inst2['id']}")
    assert r.status_code == 200
    assert r.json()["pos_x"] == 5.0

    # asset unchanged
    r = client.get(f"/api/furniture/assets/{asset_id}")
    assert r.status_code == 200

    # list instances per project
    r = client.get(f"/api/projects/{pid}/furniture/instances")
    assert r.status_code == 200
    assert len(r.json()) == 1
    r = client.get(f"/api/projects/{pid2}/furniture/instances")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_scene_config_crud(client, project):
    pid = project["id"]
    r = client.post("/api/scene-configurations", json={"project_id": pid, "name": "Layout A", "placements": [{"asset_id": 1, "pos_x": 1}]})
    assert r.status_code == 201
    sid = r.json()["id"]
    assert r.json()["name"] == "Layout A"

    r = client.get(f"/api/projects/{pid}/scene-configurations")
    assert r.status_code == 200
    assert len(r.json()) >= 1

    r = client.patch(f"/api/scene-configurations/{sid}", json={"name": "Layout B"})
    assert r.status_code == 200
    assert r.json()["name"] == "Layout B"

    r = client.post(f"/api/scene-configurations/{sid}/duplicate")
    assert r.status_code == 201
    assert "copy" in r.json()["name"].lower()

    r = client.delete(f"/api/scene-configurations/{sid}")
    assert r.status_code == 204
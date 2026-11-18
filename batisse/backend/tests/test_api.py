import io

import cv2
import numpy as np
import pymupdf
import pytest

from synth import render_plan

ROOMS = [(100, 100, 500, 500), (500, 100, 900, 500), (100, 500, 500, 700)]


def png_bytes():
    img = render_plan(ROOMS, doors=[(500, 300, 80, "v"), (300, 500, 80, "h")], windows=[(300, 100, 100, "h")])
    return cv2.imencode(".png", img)[1].tobytes()


def pdf_bytes(pages=2):
    doc = pymupdf.open()
    for i in range(pages):
        p = doc.new_page(width=842, height=595)
        if i == pages - 1:
            p.insert_image(p.rect, stream=png_bytes())
    return doc.tobytes()


def upload(client, pid, name, data, ctype="application/octet-stream"):
    return client.post(f"/api/projects/{pid}/uploads", files={"file": (name, io.BytesIO(data), ctype)})


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_project_crud_and_validation(client):
    r = client.post("/api/projects", json={"name": "  Villa  ", "description": "x"})
    assert r.status_code == 201 and r.json()["name"] == "Villa"
    pid = r.json()["id"]
    assert client.get(f"/api/projects/{pid}").json()["room_count"] == 0
    assert client.patch(f"/api/projects/{pid}", json={"name": "Villa 2"}).json()["name"] == "Villa 2"
    assert any(p["id"] == pid for p in client.get("/api/projects").json())
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    r = client.get(f"/api/projects/{pid}")
    assert r.status_code == 404 and r.json()["error"]["code"] == "project_not_found"


def test_project_blank_name_gives_readable_error(client):
    r = client.post("/api/projects", json={"name": "   "})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error" and "name" in err["message"]


def test_upload_rejections(client, project):
    pid = project["id"]
    r = upload(client, pid, "notes.txt", b"hello")
    assert r.status_code == 415 and r.json()["error"]["code"] == "unsupported_type"
    r = upload(client, pid, "plan.png", b"")
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_file"
    r = upload(client, pid, "plan.png", b"this is not an image at all")
    assert r.status_code == 415 and r.json()["error"]["code"] == "unrecognised_content"
    r = upload(client, pid, "plan.jpg", png_bytes())  # PNG content, .jpg name
    assert r.status_code == 415 and r.json()["error"]["code"] == "extension_mismatch"
    r = upload(client, pid, "plan.png", b"\x89PNG\r\n\x1a\n" + b"corrupt" * 20)
    assert r.status_code == 422 and "decoded" in r.json()["error"]["message"]
    assert client.get(f"/api/projects/{pid}/uploads").json() == []  # nothing left behind


def test_upload_too_large(client, project, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 1000)
    r = upload(client, project["id"], "plan.png", png_bytes())
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"


def test_password_protected_pdf_rejected(client, project):
    doc = pymupdf.open()
    doc.new_page()
    data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="secret")
    r = upload(client, project["id"], "locked.pdf", data)
    assert r.status_code == 422 and "password" in r.json()["error"]["message"].lower()


def test_pdf_upload_pages_preview_and_process_selected_page(client, project):
    pid = project["id"]
    r = upload(client, pid, "plans.pdf", pdf_bytes(3))
    assert r.status_code == 201 and r.json()["page_count"] == 3
    uid = r.json()["id"]
    prev = client.get(f"/api/uploads/{uid}/preview", params={"page": 2})
    assert prev.status_code == 200 and prev.headers["content-type"] == "image/png"
    assert client.get(f"/api/uploads/{uid}/preview", params={"page": 3}).status_code == 422
    bad = client.post(f"/api/projects/{pid}/process", json={"upload_id": uid, "page_index": 9})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "page_out_of_range"
    ok = client.post(f"/api/projects/{pid}/process", json={"upload_id": uid, "page_index": 2})
    assert ok.status_code == 200
    body = ok.json()
    assert body["report"]["rooms_found"] == 3 and body["report"]["page_index"] == 2


def test_full_flow_process_scale_edit_ready(client, project):
    pid = project["id"]
    uid = upload(client, pid, "plan.png", png_bytes()).json()["id"]
    r = client.post(f"/api/projects/{pid}/process", json={"upload_id": uid})
    assert r.status_code == 200
    out = r.json()
    g = out["geometry"]
    assert g["units"] == "px" and g["scale"]["source"] == "unknown"
    assert out["report"]["is_ml_model"] is False and out["report"]["detector"] == "classical-v1"
    assert len(g["floors"][0]["rooms"]) == 3

    # re-running without confirmation must not silently overwrite user work
    r2 = client.post(f"/api/projects/{pid}/process", json={"upload_id": uid})
    assert r2.status_code == 409 and r2.json()["error"]["code"] == "geometry_exists"
    assert client.post(f"/api/projects/{pid}/process", json={"upload_id": uid, "replace_existing": True}).status_code == 200

    gr = client.get(f"/api/projects/{pid}/geometry").json()
    assert gr["ready_for_3d"] is False and gr["has_plan_image"] is True
    assert client.get(f"/api/projects/{pid}/plan-image").headers["content-type"] == "image/png"

    # user reference: the 400 px wall is 4.0 m -> 0.01 m/px
    ref = client.post(f"/api/projects/{pid}/geometry/scale/reference",
                      json={"p1": [100, 100], "p2": [500, 100], "length": 4.0, "unit": "m"})
    assert ref.status_code == 200
    g2 = ref.json()["geometry"]
    assert g2["units"] == "m" and g2["scale"]["source"] == "user_reference"
    assert g2["scale"]["meters_per_pixel"] == pytest.approx(0.01, rel=0.02)
    assert ref.json()["ready_for_3d"] is True
    widths = sorted(round(r["width"], 1) for r in g2["floors"][0]["rooms"])
    assert widths == [4.0, 4.0, 4.0]
    assert all(w["length"] > 0 for w in g2["floors"][0]["walls"])

    # scale correction on metric geometry: wall is really 5 m
    fix = client.post(f"/api/projects/{pid}/geometry/scale/reference",
                      json={"p1": [0, 0], "p2": [4, 0], "length": 5, "unit": "m"})
    assert fix.status_code == 200
    assert sorted(round(r["width"], 1) for r in fix.json()["geometry"]["floors"][0]["rooms"]) == [5.0, 5.0, 5.0]
    # px-only endpoint refuses metric geometry
    assert client.post(f"/api/projects/{pid}/geometry/scale/accept",
                       json={"meters_per_pixel": 0.01, "source": "manual", "confidence": 1}).status_code == 409


def test_scale_reference_validation(client, project):
    pid = project["id"]
    r = client.post(f"/api/projects/{pid}/geometry/scale/reference", json={"p1": [1, 1], "p2": [1, 1], "length": 3})
    assert r.status_code == 422 and r.json()["error"]["code"] == "degenerate_reference"
    r = client.post(f"/api/projects/{pid}/geometry/scale/reference", json={"p1": [0, 0], "p2": [5, 0], "length": 5000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "implausible_reference"


def test_manual_geometry_put_get_and_rebuild(client, project):
    pid = project["id"]
    blank = client.get(f"/api/projects/{pid}/geometry").json()
    assert blank["geometry"]["units"] == "m" and blank["ready_for_3d"] is False
    geom = blank["geometry"]
    geom["floors"][0]["rooms"] = [
        {"id": "r1", "name": "Living", "room_type": "living", "polygon": [[0, 0], [5, 0], [5, 4], [0, 4]]},
        {"id": "r2", "name": "Bed", "room_type": "bedroom", "polygon": [[5, 0], [8, 0], [8, 4], [5, 4]]},
    ]
    geom["floors"][0]["openings"] = [{"id": "d1", "type": "door", "position": [5, 2], "width": 0.9, "height": 2.1}]
    r = client.put(f"/api/projects/{pid}/geometry", json={"geometry": geom})
    assert r.status_code == 200 and r.json()["ready_for_3d"] is True
    f = r.json()["geometry"]["floors"][0]
    assert len(f["walls"]) == 7 and f["openings"][0]["wall_id"]
    assert client.get(f"/api/projects/{pid}").json()["room_count"] == 2

    reb = client.post("/api/geometry/rebuild", json={"geometry": geom})
    assert reb.status_code == 200 and len(reb.json()["floors"][0]["walls"]) == 7


def test_geometry_validation_errors(client, project):
    pid = project["id"]
    geom = client.get(f"/api/projects/{pid}/geometry").json()["geometry"]
    geom["floors"][0]["rooms"] = [{"id": "r1", "polygon": [[0, 0], [1, 1]]}]
    r = client.put(f"/api/projects/{pid}/geometry", json={"geometry": geom})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    geom["floors"][0]["rooms"] = [
        {"id": "dup", "polygon": [[0, 0], [2, 0], [2, 2], [0, 2]]},
        {"id": "dup", "polygon": [[3, 0], [5, 0], [5, 2], [3, 2]]},
    ]
    r = client.put(f"/api/projects/{pid}/geometry", json={"geometry": geom})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_geometry"
    # metric geometry with an unknown scale is rejected
    bad = {"version": 1, "units": "m", "scale": {"source": "unknown"}, "floors": []}
    r = client.post("/api/geometry/rebuild", json={"geometry": bad})
    assert r.status_code == 422

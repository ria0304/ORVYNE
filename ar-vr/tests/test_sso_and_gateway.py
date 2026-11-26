"""Single sign-on, per-user downstream linking, honest errors, and persistence.

Downstream projects are replaced with mocks at the adapter boundary so these
tests assert the gateway's own behaviour (what it links, stores, forwards and
returns). They are NOT proof that WYA/TryOn/BATISSE work live.
"""
import time
import uuid
from unittest.mock import AsyncMock, patch

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from app import config, database
from app.main import app

client = TestClient(app)


def _wya_token(sub="wya-user", ttl=3600):
    return jwt.encode({"sub": sub, "exp": int(time.time()) + ttl}, "wya-secret", algorithm="HS256")


def _new_email():
    return f"user-{uuid.uuid4().hex[:10]}@example.com"


def _status_error(code, text="{}"):
    req = httpx.Request("POST", "http://x")
    return httpx.HTTPStatusError("err", request=req, response=httpx.Response(code, request=req, text=text))


class Downstream:
    """Context manager: pretend WYA and TryOn are up (or down)."""

    def __init__(self, wya=True, tryon=True):
        self.wya, self.tryon = wya, tryon
        self.patches = []
        self.wya_tokens = {}

    def __enter__(self):
        def wya_login(creds):
            if not self.wya:
                raise httpx.ConnectError("down")
            tok = self.wya_tokens.setdefault(creds["email"], _wya_token(creds["email"]))
            return {"access_token": tok, "user": {"user_id": "wya-" + creds["email"]}}

        async def login(_self, creds):
            return wya_login(creds)

        async def tryon_create(_self):
            if not self.tryon:
                raise httpx.ConnectError("down")
            return {"id": "tryon-" + uuid.uuid4().hex[:8]}

        self.patches = [
            patch("app.services.wya_service.WYAService.login", login),
            patch("app.services.tryon_service.TryOnService.create_user", tryon_create),
        ]
        for p in self.patches:
            p.start()
        return self

    def __exit__(self, *a):
        for p in self.patches:
            p.stop()


def _register(email=None, password="correct-horse-1", name="Test User"):
    email = email or _new_email()
    r = client.post("/api/auth/register", json={"email": email, "password": password, "full_name": name})
    return email, password, r


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── The one login ─────────────────────────────────────────────────────────────

def test_register_logs_in_and_links_downstream():
    with Downstream():
        email, pw, r = _register()
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["token_type"] == "bearer" and body["user"]["email"] == email
    assert body["services"] == {"wya": "linked", "tryon": "linked"}
    me = client.get("/api/auth/me", headers=_auth(body["access_token"])).json()
    assert me["user"]["email"] == email and me["services"] == {"wya": "linked", "tryon": "linked"}


def test_password_is_hashed_not_stored():
    with Downstream():
        email, pw, r = _register()
    db = database.get_db_session()
    try:
        acct = db.query(database.Account).filter_by(email=email).first()
        assert pw not in acct.password_hash and acct.password_hash.startswith("pbkdf2_sha256$")
        # nothing stored for downstream contains the password either
        links = db.query(database.DownstreamLink).filter_by(user_id=acct.id).all()
        assert all(pw not in (l.token or "") for l in links)
    finally:
        db.close()


def test_login_wrong_password_and_unknown_email_look_identical():
    with Downstream():
        email, pw, _ = _register()
        bad_pw = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
        unknown = client.post("/api/auth/login", json={"email": _new_email(), "password": "whatever1"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()


def test_register_validation_and_duplicates():
    with Downstream():
        email, _, _ = _register()
        assert client.post("/api/auth/register", json={"email": email, "password": "another-pass-1"}).status_code == 409
        # case-insensitive email
        assert client.post("/api/auth/register", json={"email": email.upper(), "password": "another-pass-1"}).status_code == 409
    assert client.post("/api/auth/register", json={"email": "nope", "password": "long-enough-1"}).status_code == 422
    assert client.post("/api/auth/register", json={"email": _new_email(), "password": "short"}).status_code == 422


def test_login_token_works_and_expired_or_forged_is_rejected():
    with Downstream():
        email, pw, _ = _register()
        tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    assert client.get("/api/auth/me", headers=_auth(tok)).status_code == 200
    expired = jwt.encode({"sub": "x", "exp": int(time.time()) - 5}, config.INTEGRATION_JWT_SECRET, algorithm="HS256")
    forged = jwt.encode({"sub": "x", "exp": int(time.time()) + 500}, "not-the-secret", algorithm="HS256")
    assert client.get("/api/auth/me", headers=_auth(expired)).status_code == 401
    assert client.get("/api/auth/me", headers=_auth(forged)).status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_wya_down_at_signup_is_reported_then_relinked_on_next_login():
    ds = Downstream(wya=False)
    with ds:
        email, pw, r = _register()
        assert r.status_code == 201
        assert r.json()["services"]["wya"] == "unavailable"      # honest, not "linked"
        tok = r.json()["access_token"]
        assert client.post("/api/wardrobe/browse", headers=_auth(tok)).status_code == 424
        ds.wya = True                                              # WYA comes back
        login = client.post("/api/auth/login", json={"email": email, "password": pw}).json()
        assert login["services"]["wya"] == "linked"


def test_logout_drops_stored_wya_session():
    with Downstream():
        email, pw, r = _register()
        tok = r.json()["access_token"]
        with patch("app.services.wya_service.WYAService.get_wardrobe", new_callable=AsyncMock, return_value=[{"id": 1}]):
            assert client.post("/api/wardrobe/browse", headers=_auth(tok)).status_code == 200
            assert client.post("/api/auth/logout", headers=_auth(tok)).json()["success"] is True
            assert client.post("/api/wardrobe/browse", headers=_auth(tok)).status_code == 424


def test_expired_wya_session_is_424_not_a_silent_failure():
    with Downstream():
        email, pw, r = _register()
        tok = r.json()["access_token"]
        uid = jwt.decode(tok, options={"verify_signature": False})["sub"]
    db = database.get_db_session()
    try:
        link = db.query(database.DownstreamLink).filter_by(user_id=uid, service="wya").first()
        from datetime import datetime, timedelta, timezone
        link.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()
    assert client.post("/api/wardrobe/browse", headers=_auth(tok)).status_code == 424


# ── Per-user isolation through the single login ───────────────────────────────

def test_each_user_reaches_wya_with_their_own_token():
    seen = []

    async def get_wardrobe(_self, token):
        seen.append(token)
        sub = jwt.decode(token, options={"verify_signature": False})["sub"]
        return [{"owner": sub}]

    with Downstream() as ds:
        ea, _, ra = _register()
        eb, _, rb = _register()
        with patch("app.services.wya_service.WYAService.get_wardrobe", get_wardrobe):
            a = client.post("/api/wardrobe/browse", headers=_auth(ra.json()["access_token"])).json()
            b = client.post("/api/wardrobe/browse", headers=_auth(rb.json()["access_token"])).json()
    assert a["items"] == [{"owner": ea}] and b["items"] == [{"owner": eb}]
    assert seen[0] != seen[1]


def test_tryon_uses_the_users_own_guest_id_and_recovers_from_a_reset():
    calls = []

    async def generate(_self, url, avatar, category, tryon_id):
        calls.append(tryon_id)
        if len(calls) == 1:
            raise _status_error(401)                  # TryOn forgot this guest
        return {"url": "http://tryon/static/r.png"}

    with Downstream():
        _, _, r = _register()
        tok = r.json()["access_token"]
        with patch("app.services.tryon_service.TryOnService.generate_tryon", generate):
            res = client.post("/api/tryon/generate", headers=_auth(tok),
                              json={"garment_image_url": "/static/g.png", "category": "top"})
    assert res.status_code == 200 and res.json()["url"].endswith("r.png")
    assert res.json()["pipeline"] == "image-based"
    assert len(calls) == 2 and calls[0] != calls[1] and calls[0].startswith("tryon-")


def test_downstream_errors_are_http_errors():
    with Downstream():
        _, _, r = _register()
        tok = r.json()["access_token"]
        h = _auth(tok)
        with patch("app.services.wya_service.WYAService.get_wardrobe", new_callable=AsyncMock,
                   side_effect=httpx.ConnectError("down")):
            assert client.post("/api/wardrobe/browse", headers=h).status_code == 503
        with patch("app.services.wya_service.WYAService.get_wardrobe", new_callable=AsyncMock,
                   side_effect=_status_error(500)):
            assert client.post("/api/wardrobe/browse", headers=h).status_code == 502
        with patch("app.services.wya_service.WYAService.get_wardrobe", new_callable=AsyncMock,
                   side_effect=_status_error(401)):
            assert client.post("/api/wardrobe/browse", headers=h).status_code == 424


def test_empty_wardrobe_cannot_get_recommendations():
    with Downstream():
        _, _, r = _register()
        with patch("app.services.wya_service.WYAService.get_wardrobe", new_callable=AsyncMock, return_value=[]):
            res = client.post("/api/wardrobe/outfit-recommendations", headers=_auth(r.json()["access_token"]), json={})
    assert res.status_code == 422


# ── BATISSE: each user has their own home ─────────────────────────────────────

def test_batisse_home_is_per_user_and_uploads_reuse_the_project():
    created = []

    async def create_project(_self, name, description=""):
        created.append(name)
        return {"id": 1000 + len(created)}

    async def upload_plan(_self, pid, filename, content, ctype):
        return {"id": 7}

    async def process_plan(_self, pid, upload_id, page_index=0, replace_existing=False):
        return {"geometry": {"units": "px", "floors": [{"rooms": [{}, {}, {}]}]}}   # real shape: the FloorPlanGeometry

    async def get_geometry(_self, pid):
        return {"project": pid, "rooms": 3}

    with Downstream():
        _, _, ra = _register()
        _, _, rb = _register()
        ha, hb = _auth(ra.json()["access_token"]), _auth(rb.json()["access_token"])
        with patch("app.services.batisse_service.BatisseService.create_project", create_project), \
             patch("app.services.batisse_service.BatisseService.upload_plan", upload_plan), \
             patch("app.services.batisse_service.BatisseService.process_plan", process_plan), \
             patch("app.services.batisse_service.BatisseService.get_geometry", get_geometry):
            assert client.get("/api/batisse/geometry", headers=ha).status_code == 404   # nothing uploaded yet
            up = client.post("/api/batisse/upload", headers=ha, files={"file": ("plan.png", b"\x89PNG-data", "image/png")})
            assert up.status_code == 200, up.text
            assert up.json()["room_count"] == 3 and up.json()["project_id"] == 1001
            assert up.json()["ready_for_3d"] is False and up.json()["units"] == "px"   # scale still needed
            client.post("/api/batisse/upload", headers=ha, files={"file": ("plan2.png", b"\x89PNG-data", "image/png")})
            assert len(created) == 1                                                    # project reused
            assert client.get("/api/batisse/geometry", headers=ha).json()["project"] == 1001
            assert client.get("/api/batisse/geometry", headers=hb).status_code == 404   # B has no home
            assert client.get("/api/batisse/projects/1001/geometry", headers=hb).status_code == 403
            assert client.get("/api/batisse/projects/1001/geometry", headers=ha).status_code == 200


def test_batisse_empty_upload_rejected_and_unimplemented_routes_are_501():
    with Downstream():
        _, _, r = _register()
        h = _auth(r.json()["access_token"])
        assert client.post("/api/batisse/upload", headers=h, files={"file": ("p.png", b"", "image/png")}).status_code == 422
        for method, path in [("post", "/api/batisse/export-glb"), ("post", "/api/batisse/rooms"),
                             ("post", "/api/room/interact/r1/open"), ("post", "/api/batisse/rooms/connect")]:
            assert getattr(client, method)(path, headers=h).status_code == 501, path


# ── Persistence ───────────────────────────────────────────────────────────────

def test_navigation_state_persists_per_user():
    with Downstream():
        _, _, ra = _register()
        _, _, rb = _register()
    ha, hb = _auth(ra.json()["access_token"]), _auth(rb.json()["access_token"])
    assert client.get("/api/navigation/state", headers=ha).json()["saved"] is False
    r = client.put("/api/navigation/state", headers=ha, json={
        "position": {"x": 3.5, "y": 1.6, "z": -2.0}, "rotation": {"x": 0, "y": 0.7, "z": 0, "w": 0.7}, "room_id": "kitchen"})
    assert r.status_code == 200
    client.put("/api/navigation/state", headers=ha, json={"position": {"x": 4.0, "y": 1.6, "z": -2.5}})  # update, not insert
    state = TestClient(app).get("/api/navigation/state", headers=ha).json()      # fresh client = fresh session
    assert state["position"] == {"x": 4.0, "y": 1.6, "z": -2.5}
    assert state["rotation"]["y"] == 0.7 and state["room_id"] == "kitchen"      # earlier fields kept
    assert client.get("/api/navigation/state", headers=hb).json()["saved"] is False
    # legacy path style still works and ignores the path user id
    client.post("/api/navigation/set-room/someone-else/bedroom", headers=ha)
    assert client.get("/api/navigation/get-position/anyone", headers=ha).json()["room_id"] == "bedroom"
    assert client.get("/api/navigation/state", headers=hb).json()["room_id"] is None


def test_navigation_rejects_non_finite_numbers():
    with Downstream():
        _, _, r = _register()
    res = client.put("/api/navigation/state",
                     headers={**_auth(r.json()["access_token"]), "Content-Type": "application/json"},
                     content='{"position": {"x": NaN, "y": 0, "z": 0}}')
    assert res.status_code == 422


def test_room_assignments_persist_accumulate_and_are_private():
    with Downstream():
        _, _, ra = _register()
        _, _, rb = _register()
    ha, hb = _auth(ra.json()["access_token"]), _auth(rb.json()["access_token"])
    for room, fn in [("r1", "wardrobe"), ("r2", "jewellery studio"), ("r3", "bedroom")]:   # 2nd+ assignments used to be lost
        assert client.post("/api/integrate/assign-room-function", headers=ha, json={"room_id": room, "function": fn}).status_code == 200
    got = TestClient(app).get("/api/integrate/room-assignments", headers=ha).json()["assignments"]
    assert got == {"r1": "wardrobe", "r2": "jewellery studio", "r3": "bedroom"}
    assert client.get("/api/integrate/room-assignments", headers=hb).json()["assignments"] == {}
    assert client.delete("/api/integrate/room-assignments/r2", headers=ha).json()["assignments"] == {"r1": "wardrobe", "r3": "bedroom"}
    assert client.delete("/api/integrate/room-assignments/r2", headers=ha).status_code == 404
    assert client.post("/api/integrate/assign-room-function", headers=ha, json={"room_id": "r9"}).status_code == 422


def test_furniture_save_updates_in_place_and_restore_is_private():
    with Downstream():
        _, _, ra = _register()
        _, _, rb = _register()
    ha, hb = _auth(ra.json()["access_token"]), _auth(rb.json()["access_token"])
    base = {"furniture_id": "sofa-1", "furniture_type": "sofa", "room_id": "living", "position_x": 1.0, "position_y": 0.0, "position_z": 2.0, "rotation_y": 0.0}
    assert client.post("/api/furniture/save", headers=ha, json=base).status_code == 200
    assert client.post("/api/furniture/save", headers=ha, json={**base, "position_x": 5.0, "rotation_y": 1.57}).status_code == 200
    items = client.get("/api/furniture/restore", headers=ha).json()
    assert items["count"] == 1                                                  # moved, not duplicated
    assert items["furniture"][0]["position"]["x"] == 5.0 and items["furniture"][0]["rotation_y"] == 1.57
    assert client.get("/api/furniture/restore", headers=hb).json()["count"] == 0


def test_scale_from_longest_wall_uses_the_longest_wall():
    sent = {}

    async def get_geometry(_self, pid):
        return {"geometry": {"units": "px", "floors": [{"walls": [
            {"start": [0, 0], "end": [10, 0]}, {"start": [0, 0], "end": [0, 300]}, {"start": [5, 5], "end": [6, 5]}]}]}}

    async def set_scale(_self, pid, p1, p2, length, unit="m"):
        sent.update(p1=p1, p2=p2, length=length, unit=unit)
        return {}

    with Downstream():
        _, _, r = _register()
        h = _auth(r.json()["access_token"])
        assert client.post("/api/batisse/scale-from-longest-wall", headers=h, json={"length": 9}).status_code == 404  # no home yet
        uid = jwt.decode(r.json()["access_token"], options={"verify_signature": False})["sub"]
        from app.main import _link_project
        _link_project(uid, 4242)
        with patch("app.services.batisse_service.BatisseService.get_geometry", get_geometry), \
             patch("app.services.batisse_service.BatisseService.set_scale_reference", set_scale):
            res = client.post("/api/batisse/scale-from-longest-wall", headers=h, json={"length": 9})
            assert client.post("/api/batisse/scale-from-longest-wall", headers=h, json={"length": -1}).status_code == 422
    assert res.status_code == 200
    assert sent == {"p1": [0, 0], "p2": [0, 300], "length": 9, "unit": "m"}


def test_production_refuses_the_public_dev_secret(monkeypatch):
    from app import config as cfg
    from app.main import lifespan
    import asyncio
    monkeypatch.setattr(cfg, "USING_DEV_JWT_SECRET", True)
    monkeypatch.setattr(cfg, "ORVYNE_ENV", "production")

    async def boot():
        async with lifespan(app):
            pass

    with pytest.raises(RuntimeError, match="INTEGRATION_JWT_SECRET"):
        asyncio.run(boot())


def test_fabric_scan_forwards_the_image_with_the_users_own_wya_token():
    seen = {}

    async def scan(_self, token, image):
        seen["sub"] = jwt.decode(token, options={"verify_signature": False})["sub"]
        seen["image"] = image
        return {"fabric": "denim", "category": "Bottoms", "color": "Blue"}

    with Downstream():
        email, _, r = _register()
        h = _auth(r.json()["access_token"])
        with patch("app.services.wya_service.WYAService.scan_fabric", scan):
            ok = client.post("/api/wardrobe/fabric-scan", headers=h, json={"image": "data:image/png;base64," + "A" * 40})
            short = client.post("/api/wardrobe/fabric-scan", headers=h, json={"image": "x"})
    assert ok.status_code == 200 and ok.json()["classification"]["fabric"] == "denim"
    assert seen["sub"] == email and seen["image"].startswith("data:image/png")
    assert short.status_code == 422
    assert client.post("/api/wardrobe/fabric-scan", json={"image": "A" * 40}).status_code == 401


def test_wya_calls_carry_the_real_client_ip_for_per_user_rate_limits():
    import asyncio
    from app.request_context import client_ip_var
    from app.services.wya_service import WYAService, _forward_client_ip

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["xff"] = request.headers.get("x-forwarded-for")
        return httpx.Response(200, json={"status": "ready"})

    svc = WYAService(base_url="http://wya.test")
    svc.client = httpx.AsyncClient(transport=httpx.MockTransport(handler), event_hooks={"request": [_forward_client_ip]})
    token = client_ip_var.set("203.0.113.7")
    try:
        assert asyncio.run(svc.ping()) is True
    finally:
        client_ip_var.reset(token)
    assert seen["xff"] == "203.0.113.7"


def test_wya_rate_limit_is_reported_as_rate_limited_not_failed():
    from app.auth import _classify
    assert _classify(_status_error(429)) == "rate_limited"
    assert _classify(httpx.ConnectError("down")) == "unavailable"
    assert _classify(_status_error(500)) == "failed"

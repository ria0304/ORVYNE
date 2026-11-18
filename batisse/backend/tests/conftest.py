import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="p2r-test-")
os.environ["PLAN2REALITY_DATA"] = _TMP
sys.path.insert(0, str(Path(__file__).parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def project(client):
    r = client.post("/api/projects", json={"name": "Test house"})
    assert r.status_code == 201
    return r.json()

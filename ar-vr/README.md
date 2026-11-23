# ar-vr — Integration Layer

**ORVYNE** — Personal Virtual Home & Lifestyle Universe

This directory holds the integration layer meant to connect the five existing projects (Batisse, WYA, TryOn, Velaris, Luna Stylist) into one virtual experience. The original projects stay independent and unchanged.

> **Status: Phase 1 foundation, not a working product.**
> The gateway starts (after installing three packages missing from `requirements.txt`) and a handful of routes proxy to the project backends. The health check always reports `unreachable`, 9 of 28 routes return `500` with no downstream running, the 3D mesh route fails on every input, and the frontend does not compile. Every claim below was checked by running the code. The root [`README.md`](../README.md) has the full endpoint table.

## Purpose

The gateway is designed to provide:

- **API gateway**: one API in front of Batisse, WYA, TryOn and Velaris (Luna chat goes through WYA's Luna router)
- **Shared schemas**: `UserReference`, `RoomMetadata`, `ScaleInfo`, `AssetReference`, `RoomAssignment`, `IntegrationHealth`
- **Coordination DB**: SQLite tables for users, room saves, outfit saves, design saves and Luna state (defined; no working route writes to them)
- **Planned, not built**: authentication coordination, a walkable 3D home, wardrobe / fitting room / boutique rooms, AR / VR

## Directory Structure

```
ar-vr/
├── README.md
├── pyproject.toml
├── package-lock.json              # empty lockfile (no root package.json)
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry point (28 API routes)
│   │   ├── config.py              # Environment-based configuration (the one the app imports)
│   │   ├── database.py            # SQLAlchemy models + engine (SQLite default)
│   │   ├── schemas.py             # Shared Pydantic models
│   │   └── services/              # Adapters
│   │       ├── batisse_service.py
│   │       ├── wya_service.py
│   │       ├── tryon_service.py
│   │       ├── velaris_service.py # also contains the experimental 3D mesh builder
│   │       └── __init__.py
│   ├── config.py                  # Duplicate of app/config.py (not imported; CORS default differs)
│   ├── requirements.txt
│   └── env.example
├── frontend/
│   ├── index.html
│   ├── package.json               # "type": "module"
│   ├── vite.config.ts             # port 2000, host: true
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                # 1,383 lines; does not compile
│       └── App.final              # older 1,326-line copy, not imported
└── tests/
    └── test_integration.py        # 23 tests
```

`arvr_integration.db` is created in whatever directory you launch Uvicorn from.

## Integration Philosophy

- **Independence first**: each project keeps its own database, API and business logic.
- **Integration via adapters**: the gateway calls each project's REST API through an `httpx` adapter. Adapters read their base URL from `config.py`. No code is duplicated and no databases are merged.
- **Honest scope**: this layer is Python / FastAPI; the frontend is React + TypeScript + Vite + Three.js.
- **Not yet true**: "service-to-service authentication" is described in `config.py`, but `INTEGRATION_JWT_SECRET` is read and never used. No route authenticates anything.

## Phase 1 — Integration Foundation (current)

| Item | State |
|---|---|
| Environment-based configuration | ✅ |
| Shared Pydantic schemas | ✅ (tested) |
| Four adapters (Batisse, WYA, TryOn, Velaris), URLs from config | ✅ importable |
| Health check with downstream status | 🔴 always `unreachable` |
| Coordination DB tables | ✅ created on startup |
| Routes that delegate to a project backend | 🟡 five work by design; untested against live backends |
| Navigation, room-create / connect / dimensions, Luna state routes | 🔴 `500` or always-failure |
| Test suite | 🟡 23 pass, but weak (see [Test Suite](#test-suite)) |

## Phase 2 — User Experience (planned, partially drafted)

The frontend code for these exists but cannot run yet because of the compile error:

- Three.js scene with `OrbitControls`, `GLTFLoader` and a first-person keyboard mode
- Room navigation from Batisse room metadata
- Wardrobe browse and outfit recommendations (WYA)
- Image-based try-on (TryOn)
- Jewellery design generation (Velaris) and a 3D mesh viewer
- Luna chat

## Development

### Prerequisites

- Python 3.10+ (checks were run on 3.12; `pyproject.toml` declares `>=3.9`)
- Node.js 18+ (frontend)
- The project backends you want to reach, each on its own port (see [Port map](#port-map))

### Quick Start

```bash
# 1. Backend dependencies
cd ar-vr/backend
pip install -r requirements.txt
pip install trimesh numpy python-multipart   # NOT in requirements.txt; the app fails to import without trimesh

# 2. Environment
cp env.example .env
# Edit .env: env.example sets all four *_BASE_URL values to :8000, which collide

# 3. Start the gateway on 8001 (Uvicorn defaults to 8000, so pass --port)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001

# 4. Frontend (new terminal). It will show a compile error until App.tsx is fixed
cd ../frontend
npm install
npm run dev
```

- Gateway: `http://127.0.0.1:8001` (docs at `/docs`)
- Frontend: `http://localhost:2000`, also on your LAN IP because `server.host` is `true`
- The database file is created on startup; you do not need to initialise it by hand

### Port map

All project backends default to `8000`. Use distinct ports and point the gateway at them:

| Service | Suggested port |
|---|---|
| `ar-vr` gateway | 8001 (frontend default) |
| Batisse | 8010 |
| WYA | 8020 |
| TryOn | 8030 |
| Velaris | 3000 |
| Luna server | 8002 (its own docs use 8001, which collides with the gateway) |

### Environment Variables

Create `backend/.env` from `backend/env.example`:

```env
# Service URLs: set these to match your port map
BATISSE_BASE_URL=http://127.0.0.1:8010
WYA_BASE_URL=http://127.0.0.1:8020
TRYON_BASE_URL=http://127.0.0.1:8030
VELARIS_BASE_URL=http://127.0.0.1:3000

# Integration layer
APP_NAME=ar-vr-integration
APP_VERSION=0.1.0
DEBUG=true
INTEGRATION_JWT_SECRET=change-me        # read but not used by any route yet

# Database
DATABASE_URL=sqlite:///./arvr_integration.db

# CORS: the Vite dev server runs on port 2000
CORS_ORIGINS=http://localhost:2000,http://127.0.0.1:2000
```

Frontend: set `VITE_API_URL` if the gateway is not at `http://127.0.0.1:8001`.

`env.example` also contains `WYA_APP_BASE_URL`, `ALLOWED_ORIGINS`, `DEFAULT_MODEL_CHAIN` and `ASSETS_DIR` / `MODELS_DIR` / `TEXTURES_DIR` lines. The first three are not read by any code; the last three are written as Python expressions (`str(__file__.replace(...))`), which a `.env` file cannot evaluate, so delete them from your `.env`.

### API Endpoints

28 routes. The legend is the one used in the root README.

✅ delegates to the downstream project, mapped error if it is down · 🟡 stub, returns success and stores nothing · 🔴 broken

**Meta**
- 🔴 `GET /api/health`: every service reads `unreachable`. `main.py` imports the `get_*_service` helpers only inside `lifespan`, so `health()` raises `NameError`, which the `except` turns into `unreachable`. Adapter `ping()` methods also return `False` instead of raising, and nothing checks the result. WYA's ping path (`/api/health/ready`) differs from WYA's real `/health/ready`

**Batisse**
- ✅ `POST /api/batisse/upload`: forwards a JSON body to Batisse `POST /api/projects` (no file upload)
- ✅ `GET /api/batisse/projects/{project_id}/geometry`
- ✅ `POST /api/batisse/projects/{project_id}/geometry/export-glb`
- 🟡 `POST /api/batisse/projects/{project_id}/geometry/scale-reference`: placeholder
- 🔴 `POST /api/batisse/rooms`: `500`, invalid relative import
- 🟡 `DELETE /api/batisse/rooms/{room_id}`: returns success, deletes nothing
- 🔴 `PUT /api/batisse/rooms/{room_id}/dimensions`: always `success: false`
- 🔴 `POST /api/batisse/rooms/connect`: always `success: false`

**WYA**
- 🔴 `POST /api/wardrobe/browse?user_id=`: delegates to WYA; `500` when WYA is down; `user_id` is a query parameter
- 🔴 `POST /api/wardrobe/outfit-recommendations?user_id=`: same, optional `occasion` and `weather` query parameters

**TryOn**
- 🔴 `POST /api/tryon/generate`: query parameters (`garment_image_url`, `avatar_params`, `user_id`); a JSON body returns `422`
- 🔴 `GET /api/tryon/status`: always returns `unhealthy`; the adapter references an undefined `user_id`

**Velaris**
- ✅ `POST /api/jewellery/generate-design`: Velaris `/api/generate-design`
- 🟡 `GET /api/jewellery/designs`: returns Velaris `/api/trends` (trend data, not saved designs)
- 🔴 `POST /api/velaris/mesh`: fails on every input (see [Velaris mesh](#velaris-3d-mesh-experimental))

**Luna**
- ✅ `POST /api/luna/chat?message=&token=`: forwards to WYA `POST /api/luna/chat`
- 🔴 `GET /api/luna/state/get_state`: `500`
- 🔴 `POST /api/luna/state/toggle_following`: `500`
- 🔴 `POST /api/luna/state/set_expression`: `500` (form field `expression`)

**Navigation and rooms**
- 🔴 `POST /api/navigation/set-position/{user_id}`: `500`
- 🔴 `POST /api/navigation/set-room/{user_id}/{room_id}`: `500`
- 🔴 `GET /api/navigation/get-position/{user_id}`: `500`
- 🟡 `POST /api/room/interact/{user_id}/{room_id}/{action}`
- 🟡 `POST /api/room/door/open/{user_id}/{from_room}/{to_room}`
- 🟡 `POST /api/room/window/toggle/{user_id}/{room_id}`

**Integration**
- 🟡 `POST /api/integrate/assign-room-function`: echoes the assignment
- 🟡 `POST /api/integrate/save-look`: echoes a look id

Why the 🔴 `500`s happen: the navigation and Luna-state handlers use `get_db_session`, `Users`, `RoomSaves`, `LunaState`, `USER_ID` and `func`, and `main.py` imports none of them. Adding the imports is not enough: the handlers also filter `Users` / `RoomSaves` by columns that do not exist on the models (`Users` has `id`, not `user_id`; `RoomSaves` has no `updated_at`), and `USER_ID` is not defined anywhere.

Many ✅ routes return HTTP `200` with `success: false` or an `error` field when the downstream project is down. Check the body, not the status code.

### Velaris 3D mesh (experimental)

`POST /api/velaris/mesh` builds parametric primitives with `trimesh` inside the gateway. Velaris itself produces only 2D output. The route currently fails on every input:

- It reads an undefined name `cart` (typo for `carat`) as soon as the design call succeeds.
- `ring`: `trimesh.creation.torus(R=, r=)` is rejected by `trimesh` 5.x.
- `necklace` / `pendant`: the face array indexes past the vertex list (`IndexError`).
- `earrings` / `bracelet`: meshes build but are not watertight.
- The final `Scene.dump_gltf()` call does not exist in `trimesh`.
- Metal / roughness / gemstone values go into `mesh.metadata`, which glTF export does not carry.

### Test Suite

```bash
cd ar-vr/backend
PYTHONPATH=. python -m pytest ../tests/test_integration.py -v
```

Result with `trimesh`, `numpy` and `python-multipart` installed and no downstream services running: **23 passed**. Without them, collection fails on `import trimesh`.

What the tests do and do not prove:
- Covers: schema construction, service module imports, health response shape, and that routes answer.
- Does not cover: any navigation, Luna-state or room-create route (the ones that return `500`), the 3D mesh, or a real downstream response.
- Most assertions accept `200` or `422`. The health test accepts `unreachable` for every service, so it passes while the health check is broken.

### Frontend

React 19 + Vite + Three.js, port 2000. One 1,383-line `App.tsx` with a router and five pages: Batisse, Wardrobe, TryOn, Jewellery, Luna. Intended features: a Three.js scene with `OrbitControls`, `GLTFLoader` loading of Batisse GLB exports, room markers from Batisse metadata, toasts and loading states, and a first-person keyboard mode.

**It does not compile.**
- `App.tsx` has a corrupted block around lines 160–170 (a duplicated `toast('Interact with object')` fragment inside the keyboard-handler `useEffect`). `vite build` fails with `Expected ',' or ')' but found '}'`.
- It calls `React.useRef` / `React.useEffect` 49 times but imports only named hooks, so it would throw `React is not defined` after the syntax fix.
- The movement `switch` has no `break` statements, so one key sets several flags.
- Several request bodies do not match the gateway's query-parameter signatures (for example `POST /api/wardrobe/browse` is sent as JSON).

`npm install` succeeds. Dependencies (`react`, `react-dom`, `react-router-dom`, `three`, `@vitejs/plugin-react`) are declared in `package.json`.

### Database

SQLite (`arvr_integration.db`), tables created on startup:

| Table | Purpose | Written by a working route? |
|---|---|---|
| `integration_metadata` | Coordination metadata | No |
| `users` | Central user profile | No |
| `room_saves` | Room assignments per user | No |
| `outfit_saves` | Saved outfits | No |
| `design_saves` | Saved jewellery designs | No |
| `luna_state` | Luna companion state | No |

Each project retains its own database. This layer only defines coordination metadata, and today it stores none.

### Architecture

```
Frontend (React + Vite, port 2000, does not compile)
       ↓ fetch →
Gateway (FastAPI, port 8001)
  ├── /api/batisse/*      → Batisse   (e.g. :8010)
  ├── /api/wardrobe/*     → WYA       (e.g. :8020)
  ├── /api/tryon/*        → TryOn     (e.g. :8030)
  ├── /api/jewellery/*    → Velaris   (e.g. :3000)
  ├── /api/velaris/mesh   → local trimesh builder (broken)
  ├── /api/luna/chat      → WYA /api/luna/chat
  ├── /api/luna/state/*   → coordination DB (broken)
  ├── /api/navigation/*   → coordination DB (broken)
  ├── /api/room/*         → stubs
  ├── /api/integrate/*    → stubs
  └── /api/health         → always "unreachable"
```

Adapters (`batisse_service.py`, `wya_service.py`, `tryon_service.py`, `velaris_service.py`) import and instantiate lazily. Downstream backends are independent; the gateway forwards requests and does not aggregate responses.

### Velaris adapter notes

- `velaris_service.py` imports `trimesh` and `numpy` at module level, so a missing install breaks the whole gateway, not only the mesh route.
- `VelarisService.find_similar` calls `/api/similar`; Velaris serves `/api/find-similar`. No gateway route uses it yet.

## Troubleshooting

### `ModuleNotFoundError: No module named 'trimesh'`

`trimesh` and `numpy` are imported by `velaris_service.py` but not listed in `requirements.txt`. Run `pip install trimesh numpy python-multipart`, or add them to `requirements.txt`.

### Every service shows `unreachable` in `/api/health`

Expected today. See the Meta entry under [API Endpoints](#api-endpoints).

### `500` from `/api/navigation/*` or `/api/luna/state/*`

Expected today: missing imports in `main.py`.

### `422` on wardrobe or try-on calls

These routes read query parameters. `POST /api/wardrobe/browse?user_id=abc` works as a request shape; a JSON body does not.

### Frontend shows a Vite compile error

Expected today. See [Frontend](#frontend).

### Vite warning: `configLoader: 'native'` / ESM syntax in `vite.config.ts` loaded as CommonJS

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'` ...
  - ESM syntax in a file loaded as CommonJS (vite.config.ts:1:1).
```

`"type": "module"` in `frontend/package.json` already fixes this. If you still see it, re-run `npm install` and `npm run dev`. Alternatives: rename the config to `vite.config.mts`, or set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`.

## Next steps (in order)

1. Add `trimesh`, `numpy`, `python-multipart` to `requirements.txt`.
2. Import the missing names in `main.py`; fix the `..services` relative imports; fix `Users` / `RoomSaves` column usage; define a real user id source in place of `USER_ID`.
3. Fix the health check (module-level imports, `ping()` contract, WYA path).
4. Return real HTTP error codes for downstream failures and `501` for stubs.
5. Move wardrobe and try-on inputs into request bodies; fix `get_tryon_status`.
6. Fix or remove `/api/velaris/mesh`.
7. Repair `App.tsx` (corrupted block, `React` import, `break`s) and get `vite build` green.
8. Replace the weak tests with ones that assert real behaviour.

# ar-vr — Integration Layer

**ORVYNE** — Personal Virtual Home & Lifestyle Universe

This directory contains the integration layer that connects the five existing projects (BATISSE, WYA, TryOn, VELARIS, luna-stylist) into a unified virtual experience. The original projects remain independent and unchanged.

## Purpose

The `ar-vr` integration backend provides:

- **API gateway** — Coordinates inter-project communication between BATISSE, WYA, TryOn, VELARIS, and luna-stylist
- **Authentication coordination** — Secure service-to-service auth without exposing user tokens
- **Shared schemas** — Common types for user references, room metadata, scale info, and asset references
- **3D environment coordination** — Load and navigate generated houses, wardrobes, fitting rooms, jewellery boutiques, and AI chat
- **Data flow orchestration** — Coordinate BATISSE → virtual home, WYA → wardrobe, TryOn → fitting room, VELARIS → boutique, luna-stylist → chat

## Directory Structure

```
ar-vr/
├ README.md
├ backend/
│   ├── app/
│   │   ├── main.py              # FastAPI integration entry point (port 8001)
│   │   ├── config.py            # Environment-based configuration
│   │   ├── database.py          # Shared SQLite (development) / PostgreSQL later
│   │   ├── schemas.py           # Shared Pydantic models
│   │   └── services/            # Coordination services (5 adapters)
│   │       ├── batisse_service.py   # BATISSE adapter
│   │       ├── wya_service.py       # WYA adapter
│   │       ├── tryon_service.py     # TryOn adapter
│   │       ├── velaris_service.py   # VELARIS adapter
│   │       └── __init__.py
│   ├── config.py                # Top-level config module
│   ├── requirements.txt         # ar-vr specific dependencies
│   ├── env.example              # Environment variables template (copy to .env)
│   └── arvr_integration.db      # SQLite integration database (auto-created)
├ frontend/
│   ├── src/
│   │   ├── main.tsx             # React entry point
│   │   └── App.tsx              # Complete React+Three.js frontend
│   ├── package.json             # "type": "module" (ESM) — see Troubleshooting
│   └── vite.config.ts           # Vite config, port 2000
├ tests/
│   └── test_integration.py      # Integration test suite
├ pyproject.toml
└ package-lock.json
```

## Integration Philosophy

- **Independence first**: Each existing project (BATISSE, WYA, TryOn, VELARIS, luna-stylist) remains a fully independent application with its own database, APIs, and business logic.
- **Integration via adapters**: The ar-vr backend connects to existing projects via their verified REST APIs — no code duplication, no merged databases.
- **Incremental development**: Start with integration foundation, then progressively add virtual home, wardrobe, fitting room, jewellery boutique, and AI chat features.
- **Security by design**: Service-to-service authentication uses API keys stored in environment variables; user tokens never exposed across services.
- **Technology Python-first**: The integration layer is Python/FastAPI central; the frontend uses React + TypeScript + Vite + Three.js.

## Phase 1 — Integration Foundation

See the `backend/app/main.py` for the FastAPI setup. This phase establishes:
- Environment-based configuration
- Shared Pydantic schemas (UserReference, RoomMetadata, ScaleInfo, AssetReference, RoomFunction)
- Health checks
- Service adapters with 22 registered endpoints
- Integration test suite (23 tests, all passing)

## Phase 2 — User Experience

- Three.js scene management with OrbitControls in the React frontend
- Interactive room navigation using BATISSE room metadata
- Visual wardrobe browsing with WYA AI recommendations
- Image-based virtual try-on using TryOn backend
- AI-generated jewellery designs with parametric 3D meshes (VELARIS)
- Luna AI fashion chatbot with conversation history

## Development

### Prerequisites

- Python 3.12+
- Node.js 18+ (for frontend)
- Git

### Quick Start

```bash
# 1. From the repository root
cd ar-vr/backend

# 2. Install backend dependencies
pip install -r requirements.txt

# 3. Copy environment example and adjust
cp env.example .env
# Edit .env if needed (default values are fine for local development)

# 4. Initialize the database
python -c "from app.database import init_db; init_db()"
# Or simply run the tests (init_db runs implicitly)

# 5. Start the FastAPI backend (port 8001)
uvicorn app.main:app --reload --host 127.0.0.1

# 6. Start the frontend (port 2000, in a new terminal)
cd ../frontend
npm install
npm run dev
```

The integration backend will be available at `http://127.0.0.1:8001`
The frontend will be available at `http://localhost:2000` (also exposed on your LAN IP, since `server.host` is `true`)

### Environment Variables

Create `backend/.env` from `backend/env.example`:

```
# Service URLs (existing projects — local development defaults)
BATISSE_BASE_URL=http://127.0.0.1:8000
WYA_BASE_URL=http://127.0.0.1:8000
TRYON_BASE_URL=http://127.0.0.1:8000
VELARIS_BASE_URL=http://127.0.0.1:8000

# Integration layer
APP_NAME=ar-vr-integration
APP_VERSION=0.1.0
DEBUG=true
INTEGRATION_JWT_SECRET=ar-vr-dev-secret-change-in-production

# Database
DATABASE_URL=sqlite:///./arvr_integration.db

# CORS — frontend origins that can call the integration API
# Must include the Vite dev server origin (port 2000)
CORS_ORIGINS=http://localhost:2000,http://127.0.0.1:2000,http://localhost:5173,http://127.0.0.1:5173

# WYA specific
WYA_APP_BASE_URL=http://127.0.0.1:8000
ALLOWED_ORIGINS=http://localhost:2000
```

### API Endpoints

The integration layer registers 22 endpoints across 5 project domains:

**BATISSE** (3 endpoints)
- `GET /api/health` — Health check
- `GET /api/batisse/projects/{project_id}/geometry` — Get floor plan geometry
- `POST /api/batisse/projects/{project_id}/geometry/export-glb` — Export GLB
- `POST /api/batisse/projects/{project_id}/geometry/scale-reference` — Set scale
- `POST /api/batisse/upload` — Upload floor plan

**WYA** (2 endpoints)
- `GET /api/wardrobe/browse` — Browse wardrobe items
- `POST /api/wardrobe/outfit-recommendations` — Get outfit recommendations

**TryOn** (3 endpoints)
- `GET /api/health` — Health check (shared)
- `POST /api/tryon/generate` — Generate try-on
- `GET /api/tryon/status` — Check processing status

**VELARIS** (4 endpoints)
- `GET /api/jewellery/designs` — List designs
- `POST /api/jewellery/generate-design` — Generate design
- `POST /api/velaris/mesh` — Generate 3D mesh
- `GET /api/health` — Health check (shared)

**luna-stylist** (1 endpoint)
- `POST /api/luna/chat` — AI fashion chat

**Integration** (9 endpoints)
- `GET /api/navigation/get-position/{user_id}` — Get room position
- `POST /api/navigation/set-position/{user_id}` — Set room position
- `POST /api/navigation/set-room/{user_id}/{room_id}` — Navigate to room
- `POST /api/room/door/open/{user_id}/{from_room}/{to_room}` — Open door
- `POST /api/room/interact/{user_id}/{room_id}/{action}` — Room interaction
- `POST /api/integrate/assign-room-function` — Assign room function
- `POST /api/integrate/save-look` — Save outfit look

Total: 22 unique endpoints (some paths shared via GET/HEAD for docs)

### Test Suite

Run the integration test suite:

```bash
cd ar-vr
python -m pytest tests/test_integration.py -v
```

Covers health, schemas, service imports, BATISSE endpoints, WYA endpoints, TryOn endpoints, VELARIS endpoints, integration routing, and the Pydantic schemas.

### Frontend

The React+Vite frontend runs on port 2000 and provides a unified interface across all 5 projects:

- **BATISSE** — Floor plan upload, 3D home rendering (Three.js), room navigation with clickable room markers, geometry-derived or actual GLB scenes
- **WYA** — Wardrobe browse, AI outfit recommendations
- **TryOn** — Virtual try-on generation
- **VELARIS** — Jewellery design generation with parametric meshes
- **luna-stylist** — AI fashion chatbot

Key frontend features:
- Three.js scene with OrbitControls
- Scene type distinction: ACTUAL_BATISSE (GLB export) vs GEOMETRY_DERIVED (walls/labels) vs PLACEHOLDER
- Interactive room navigation via room metadata (room_function, polygon, area_sq_m, ready_for_3d)
- Toast notifications, loading states, gradient design language consistent across all pages
- GLB model loading with data URI output from VELARIS

### Database

SQLite integration database (development) — `arvr_integration.db`:
- `users` — Central user profile (coordination only)
- `room_saves` — Room assignments per user
- `outfit_saves` — Saved outfits per user
- `design_saves` — Saved jewellery designs per user
- `integration_metadata` — Coordination metadata (existing)

Each project retains its own independent database. This module only stores coordination metadata.

### Architecture

```
Frontend (React + Vite, port 2000)
       ↓ HTTPS fetch →
Backend (FastAPI, port 8001)
  ├── /api/batisse/*     → BATISSE service (port 8000)
  ├── /api/wardrobe/*    → WYA service (port 8000)
  ├── /api/tryon/*      → TryOn service (port 8000)
  ├── /api/jewellery/*  → VELARIS service (port 8000)
  ├── /api/luna/*       → luna-stylist service (port 8000)
  ├── /api/navigation/* → Room navigation coordination
  ├── /api/room/*       → Room interaction coordination
  └── /api/integrate/*  → Integration coordination
  └── /api/health       → Health check (all services)
```

Each service adapter (batisse_service.py, wya_service.py, tryon_service.py, velaris_service.py) is importable and functional. Downstream service backends are independent; the integration layer routes requests and aggregates responses.

### VELARIS Note

`import httpx` is placed inside methods (not at module level) in `velaris_service.py` to avoid import errors when the backend is unreachable. 3D mesh generation (parametric rings, necklaces, bracelets, earrings with PBR materials) works when the VELARIS backend is reachable.



## Troubleshooting

### Vite warning: `configLoader: 'native'` / ESM syntax in `vite.config.ts` loaded as CommonJS

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'` ...
  - ESM syntax in a file loaded as CommonJS (vite.config.ts:1:1).
```

Fixed by `"type": "module"` in `frontend/package.json`, which makes Vite load `vite.config.ts` as ESM. If you still see it, make sure you are using the updated `package.json` and re-run `npm run dev`. Alternatives: rename the config to `vite.config.mts`, or set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress it.

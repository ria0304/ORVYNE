<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-ORVYNE-black?style=flat-square&logo=github)](https://github.com/ria0304/ORVYNE)
<img src="https://img.shields.io/badge/React-TypeScript-blue?style=flat-square&logo=react" />
<img src="https://img.shields.io/badge/FastAPI-Python-green?style=flat-square&logo=fastapi" />
<img src="https://img.shields.io/badge/3D-Three.js%20%2B%20GLB-orange?style=flat-square&logo=three.js" />
<img src="https://img.shields.io/badge/Integration-ar--vr%20Gateway-purple?style=flat-square" />
<img src="https://img.shields.io/badge/Storage-SQLite-blue?style=flat-square&logo=sqlite" />


# ORVYNE — Your Personal Virtual World


**Upload your floor plan. Walk through your home. Open your wardrobe. Try it on. Design the jewellery.**

ORVYNE is a personalised virtual-world platform where people can explore a digital version of their own home, manage their wardrobe, try outfits virtually, and design jewellery — all within one connected 3D environment. The `ar-vr/` integration layer is the hub that connects five independent projects into that single experience.

</div>

---

## The Problem

Online fashion and jewellery shopping happens in disconnected tools, inside generic virtual malls that know nothing about the person using them.

**Customers** keep their wardrobe in one app, their outfit inspiration in another, their try-on in a third, and custom jewellery in a fourth — none of which share context, and none of which feel like *their* space.

**Builders** of those tools face the opposite problem: each product is useful on its own, but nothing ties them into one journey a user can actually walk through.

---

## The Solution

Instead of entering a generic virtual shopping mall, every ORVYNE user gets their own personalised virtual space.

1. **Create your virtual home** — upload your real house floor plan. Batisse generates a 3D representation of it.
2. **Enter your home** — walk through your virtual rooms using a keyboard and mouse.
3. **Explore your wardrobe** — WYA brings your actual wardrobe into the virtual experience and helps you discover outfits.
4. **Try on clothes** — TryOn generates virtual clothing previews.
5. **Design jewellery** — visit your own virtual jewellery boutique, powered by Velaris.
6. **Get fashion assistance** — Luna Stylist acts as an AI fashion assistant for outfit combinations and styling decisions.

The `ar-vr` backend coordinates all of it through each project's REST API. No code is duplicated and no databases are merged.

---

## Core User Flow

```
Sign up
        ↓
Upload floor plan (JPG / PNG / PDF)
        ↓
Batisse — plan → walls, rooms, openings → validated geometry → GLB
        ↓
Virtual home — rooms assigned a function (bedroom, study, storage …)
        ↓
    ┌───────────────┬────────────────┬─────────────────┐
    ↓               ↓                ↓                 ↓
Wardrobe room   Fitting room    Jewellery boutique   Luna Stylist
WYA closet,     TryOn outfit    Velaris text /       conversational
outfit scoring  previews        sketch / photo →     styling over
                                design + spec        WYA wardrobe context
        ↓
Complete look (clothing + jewellery)
```

---

## The Five Technologies

| # | Project | Role in ORVYNE | What it does |
|---|---|---|---|
| 1 | **Batisse** | Your virtual home | Converts uploaded floor plans into 3D house geometry |
| 2 | **WYA** | Your wardrobe intelligence | Manages clothing, outfit recommendations, colour analysis and personal style |
| 3 | **TryOn** | Your virtual fitting room | Generates previews of how clothing may look on a person |
| 4 | **Velaris** | Your jewellery studio | Generates personalised jewellery designs from creative inspiration |
| 5 | **Luna Stylist** | Your AI fashion companion | Conversational styling assistance using wardrobe context from WYA |

### 1 — Batisse (floor plan → 3D home)

FastAPI + SQLAlchemy backend with a classical CV pipeline: OpenCV / PyMuPDF preprocessing (resize, deskew, perspective correction), wall / room / opening detection with per-element confidence, Tesseract OCR for room labels and dimensions, and a Shapely geometry builder (shared walls, T-junctions, footprint, validation). Scale is proposed from labels but never auto-applied — the user confirms it with a two-point reference. The frontend is React 19 + `@react-three/fiber` with a dollhouse viewer, 2D plan editor (undo/redo) and 2D↔3D selection sync. Geometry exports to GLB.

### 2 — WYA (wardrobe intelligence)

Full-stack fashion AI app: FastAPI backend, React + TypeScript frontend, FashionCLIP embeddings, colour matching, style profiling, outfit generation, gap analysis, weather-aware outfits and a sustainability score. Deployed on AWS (CloudFront + S3 + EC2).

### 3 — TryOn (virtual fitting room)

Turns any clothing screenshot into a transparent garment cutout, fits it to a 3D mannequin (React Three Fiber), and lets users build, save and compare outfits. Optional local CatVTON pipeline for photorealistic renders. **The pipeline is image-based — it does not do 3D cloth simulation or avatar rigging.**

### 4 — Velaris (jewellery studio)

Turns text, sketches or inspiration photos into a jeweller-ready spec sheet, parametric CAD views (7 jewellery types), realistic previews, a cost breakdown, a PDF and a 2D DXF. A multi-model OpenRouter fallback chain drives generation; four optional deep learning modules (type, style, gemstone, similarity) fail soft. **Output is 2D — it does not produce 3D jewellery meshes.**

### 5 — Luna Stylist (AI fashion companion)

Chat interface over WYA's API. Intent classification plus smart replies, with outfit cards and a wardrobe panel synced from the user's WYA account. Server runs on its own port (8001).

---

## The Integration Layer (`ar-vr/`)

`ar-vr/` is the main code of ORVYNE. It is a FastAPI service that:

- **Gateways** requests to Batisse, WYA, TryOn and Velaris through one API
- **Adapts** each project through a dedicated service class (`httpx` async client), translating shared schemas into project-specific calls
- **Shares schemas** — `UserReference`, `RoomMetadata`, `ScaleInfo`, `AssetReference`, `RoomAssignment`
- **Reserves a coordination DB** — its own SQLite file (`arvr_integration.db`) with one `integration_metadata` table, created on startup. **No route writes to it yet**: room assignments and saved looks are acknowledged but not persisted
- **Leaves the originals alone** — each project keeps its own code, API and database

### Integration endpoints

| Method | Endpoint | Delegates to |
|---|---|---|
| `GET` | `/api/health` | Integration health + downstream service status |
| `POST` | `/api/batisse/upload` | Batisse `POST /api/projects` |
| `GET` | `/api/batisse/projects/{id}/geometry` | Batisse validated geometry |
| `POST` | `/api/batisse/projects/{id}/geometry/export-glb` | Batisse GLB export |
| `POST` | `/api/batisse/projects/{id}/geometry/scale-reference` | *Stub — returns a placeholder, does not call Batisse* |
| `POST` | `/api/wardrobe/browse` | WYA `GET /api/user/wardrobe` |
| `POST` | `/api/wardrobe/outfit-recommendations` | WYA `GET /api/ai/outfit-score` |
| `POST` | `/api/tryon/generate` | TryOn `POST /api/tryon` |
| `GET` | `/api/tryon/status` | *Hard-coded response — does not contact TryOn* |
| `POST` | `/api/jewellery/generate-design` | Velaris `POST /api/generate-design` |
| `GET` | `/api/jewellery/designs` | Velaris `GET /api/trends` |
| `POST` | `/api/luna/chat` | WYA `/luna-api/chat` — **currently broken**, see Known Limitations |
| `POST` | `/api/navigation/set-position/{user_id}` | *Stub — echoes the position, stores nothing* |
| `POST` | `/api/navigation/set-room/{user_id}/{room_id}` | *Stub — echoes the room, stores nothing* |
| `GET` | `/api/navigation/get-position/{user_id}` | *Stub — always returns the origin* |
| `POST` | `/api/room/interact/{user_id}/{room_id}/{action}` | *Stub — echoes the action* |
| `POST` | `/api/room/door/open/{user_id}/{from_room}/{to_room}` | *Stub — echoes the request* |
| `POST` | `/api/room/window/toggle/{user_id}/{room_id}` | *Stub — echoes the request* |
| `POST` | `/api/integrate/assign-room-function` | *Stub — echoes the assignment, does not persist it* |
| `POST` | `/api/integrate/save-look` | *Stub — echoes a look id, does not persist it* |

Room functions: `bedroom`, `living_room`, `kitchen`, `bathroom`, `dining_room`, `storage`, `spare_bedroom`, `study`, `balcony`, `hallway`, `other`.

---

## Architecture

```mermaid
flowchart LR
    A["🌐 Browser<br/>User"]:::gray
    B["🏠 3D Virtual World<br/>React + Three.js"]:::teal
    C["🔗 ar-vr Gateway<br/>FastAPI"]:::purple
    D["🗄️ SQLite<br/>arvr_integration.db"]:::gray
    E["🏗️ Batisse<br/>floor plan → 3D"]:::blue
    F["👗 WYA<br/>wardrobe intelligence"]:::amber
    G["🪞 TryOn<br/>fitting room"]:::green
    H["💎 Velaris<br/>jewellery studio"]:::green
    I["🌙 Luna Stylist<br/>AI companion"]:::amber

    A --> B
    B -->|"/api/*"| C
    C --> D
    C --> E
    C --> F
    C --> G
    C --> H
    I -->|"wardrobe context"| F
    B -.-> I

    classDef gray   fill:#e8e6e1,stroke:#9c9a92,color:#2C2C2A
    classDef teal   fill:#E1F5EE,stroke:#0F6E56,color:#085041
    classDef blue   fill:#E6F1FB,stroke:#185FA5,color:#0C447C
    classDef amber  fill:#FAEEDA,stroke:#854F0B,color:#633806
    classDef purple fill:#EEEDFE,stroke:#534AB7,color:#26215C
    classDef green  fill:#EAF3DE,stroke:#3B6D11,color:#173404
```

Solid arrows exist in `ar-vr/backend`, but several of those routes are stubs (see the endpoint table). The unified 3D front end (dotted / top-left) is only a scaffold: `ar-vr/frontend` has a router shell and buttons that call the gateway, and does not yet build or render a 3D scene — see [Known Limitations](#known-limitations).

---

## Tech Stack

**Integration layer (`ar-vr/`)**
- FastAPI + Uvicorn, Pydantic schemas
- `httpx` async clients for service-to-service calls
- SQLAlchemy + SQLite (PostgreSQL via `DATABASE_URL`)
- `python-dotenv` config, `slowapi` (listed dependency, not wired), CORS allowlist
- `ar-vr/frontend`: Vite + `three` scaffold (React and `react-router-dom` are imported but not yet declared in `package.json`)

**Frontends (per project)**
- React + TypeScript + Vite, Tailwind CSS
- Three.js / `@react-three/fiber` / `@react-three/drei` (Batisse, TryOn)
- Zustand (Batisse)

**Backends (per project)**
- FastAPI (Python) across all five
- OpenCV, Shapely, PyMuPDF, Tesseract (Batisse)
- FashionCLIP, AWS SageMaker (WYA)
- rembg, MediaPipe, CatVTON (TryOn)
- OpenRouter fallback chain, PyTorch, ultralytics, CLIP, ReportLab, `ezdxf` (Velaris)

---

## Project Structure

```
ORVYNE/
│
├── ar-vr/                            # ★ Main code — ORVYNE integration layer
│   ├── README.md
│   ├── pyproject.toml
│   ├── frontend/                     # Scaffold only — Vite app, port 3000
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       └── App.tsx               # Routes: /batisse /wardrobe /tryon /jewellery … calling the gateway
│   ├── backend/
│   │   ├── config.py                 # Older, shorter copy of app/config.py (no WYA block, no ensure_dirs)
│   │   ├── requirements.txt          # fastapi, uvicorn, pydantic, httpx, sqlalchemy, python-dotenv, slowapi
│   │   └── app/
│   │       ├── main.py               # FastAPI gateway — all /api/* routes (health, batisse, navigation, room, wardrobe, tryon, jewellery, luna, integrate)
│   │       ├── config.py             # Service URLs, JWT secret, DB URL, CORS, asset dirs
│   │       ├── database.py           # SQLAlchemy engine + IntegrationMetadata table
│   │       ├── schemas.py            # UserReference, RoomMetadata, AssetReference, …
│   │       └── services/             # One adapter per project
│   │           ├── batisse_service.py
│   │           ├── wya_service.py
│   │           ├── tryon_service.py
│   │           └── velaris_service.py
│   └── tests/
│       └── test_integration.py       # Health, endpoint and schema tests (see Run the tests)
│
├── batisse/                          # Floor plan → 3D dollhouse
│   ├── DEVLOG.md
│   ├── backend/app/                  # FastAPI: routers, processing/ (CV, OCR, scale), schemas
│   └── frontend/src/                 # React + R3F: three/, pages/, store/, components/
│
├── WYA-Whats-Your-Aesthetic-main/    # Wardrobe intelligence
│   ├── main.py, routers/, services/  # FastAPI backend
│   ├── views/                        # React views (Closet, AIMatcher, Weather …)
│   ├── data/                         # Colour, fashion and region datasets
│   └── tests/
│
├── TryOn-main/                       # Virtual fitting room
│   ├── backend/                      # FastAPI, services/ (warping, landmarks, fitting), evaluation/
│   ├── src/                          # React + Three.js mannequin and outfit builder
│   └── public/models/                # Mannequin GLBs
│
├── Velaris-From-Inspiration-to-Jewellery-Design-main/   # Jewellery studio
│   ├── backend/                      # design, cad/, render/, beauty/, ml/, pdf_generator
│   ├── ml_training/                  # Offline training for modules 1–4
│   ├── src/                          # React frontend
│   └── tests/
│
├── luna-stylist-main/                # AI fashion companion
│   ├── server/                       # FastAPI: intent.py, smart_reply.py
│   └── src/                          # React chat UI
│
└── .gitignore
```

---

## Run Locally

Each project runs as its own service. Start the ones you need, then the `ar-vr` gateway.

> **Port conflict:** Batisse, WYA, TryOn and the `ar-vr` defaults all assume `127.0.0.1:8000`, and Velaris runs on `3000`. Run each backend on its own port and point the gateway at them with the `*_BASE_URL` variables below.

**Step 1 — Clone**

```bash
git clone https://github.com/ria0304/ORVYNE.git
cd ORVYNE
```

**Step 2 — Start the project backends** (one terminal each, pick the ports you like)

```bash
# Batisse
cd batisse/backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010

# WYA
cd WYA-Whats-Your-Aesthetic-main && pip install -r requirements.txt
uvicorn main:app --reload --port 8020

# TryOn
cd TryOn-main/backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8030

# Velaris
cd Velaris-From-Inspiration-to-Jewellery-Design-main && pip install -r requirements.txt
cp .env.example .env     # add OPENROUTER_API_KEY
uvicorn main:app --reload --port 3000

# Luna (optional)
cd luna-stylist-main/server && pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Batisse also needs the Tesseract OCR binary installed on your system.

**Step 3 — Configure and start the `ar-vr` gateway**

```bash
cd ar-vr/backend
pip install -r requirements.txt
```

Create `ar-vr/backend/.env`:

```env
BATISSE_BASE_URL=http://127.0.0.1:8010
WYA_BASE_URL=http://127.0.0.1:8020
TRYON_BASE_URL=http://127.0.0.1:8030
VELARIS_BASE_URL=http://127.0.0.1:3000
INTEGRATION_JWT_SECRET=change-me
```

```bash
uvicorn app.main:app --reload --port 8000
```

**Step 4 — Open the API docs**

```
http://localhost:8000/docs
```

**Step 5 — Run a project frontend** (each is a Vite app)

```bash
cd batisse/frontend && npm install && npm run dev      # floor plan → 3D dollhouse
cd TryOn-main && npm install && npm run dev            # fitting room (port 3002)
cd WYA-Whats-Your-Aesthetic-main && npm install && npm run dev   # wardrobe (port 3000)
cd Velaris-From-Inspiration-to-Jewellery-Design-main && npm install && npm run dev   # jewellery (port 5173)
cd luna-stylist-main && npm install && npm run dev     # Luna chat
```

The `ar-vr/frontend` scaffold (`npm install && npm run dev`, port 3000) is **not** in this list on purpose: it does not build yet, and it points at `http://127.0.0.1:8001` (Luna's port) instead of the gateway's `8000`. Fix both before using it.

Each frontend runs on its own default port; if two collide on the same machine, pass `--port` to Vite.

---

## Verify the gateway is working

```bash
curl http://localhost:8000/api/health
```

```bash
curl -X POST http://localhost:8000/api/jewellery/generate-design \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A simple emerald ring with gold band",
    "inputType": "text",
    "style": "Contemporary Minimalist",
    "budget": "Balanced"
  }'
```

**Run the tests**

```bash
pip install pytest
cd ar-vr
PYTHONPATH=backend pytest tests/
```

Last run with no downstream services started: **12 passed, 11 failed**. The failures are the Batisse and Velaris route tests (the gateway raises when the target is down instead of returning a mapped error) and the schema tests (import path).

---

## Common Issues

| Problem | Fix |
|---|---|
| Services all fail to respond | Batisse, WYA and TryOn all default to `:8000` — give each its own port and set the matching `*_BASE_URL` |
| `/api/health` shows `unreachable` for every service | Expected today — the route imports from a non-importable path and never pings anything. Check the startup log lines (`… service reachable`) instead, and note those are unreliable too (see Known Limitations) |
| `/api/luna/chat` returns `Luna backend unavailable` | Known bug — the route references an undefined `WYA_BASE_URL` |
| `ModuleNotFoundError` in a project | Run `pip install -r requirements.txt` inside that project's folder |
| Batisse OCR does nothing | Install the Tesseract binary (`pytesseract` is only a wrapper) |
| Velaris says `OPENROUTER_API_KEY` not set | Add it to that project's `.env` and restart |
| WYA / Luna API features are offline on the hosted demos | The EC2 backends are paused to save AWS cost — run them locally |
| Frontend blank / API errors | Start the backend first |

---

## Environment Variables (`ar-vr`)

| Variable | Required | Description |
|---|---|---|
| `BATISSE_BASE_URL` | Yes (in practice) | Batisse backend URL (default `http://127.0.0.1:8000`) |
| `WYA_BASE_URL` | Yes (in practice) | WYA backend URL (default `http://127.0.0.1:8000`) |
| `TRYON_BASE_URL` | Yes (in practice) | TryOn backend URL (default `http://127.0.0.1:8000`) |
| `VELARIS_BASE_URL` | Yes (in practice) | Velaris backend URL (default `http://127.0.0.1:8000`) |
| `INTEGRATION_JWT_SECRET` | Yes in production | Service-to-service JWT secret (dev default must be changed) |
| `DATABASE_URL` | No | Coordination DB (default `sqlite:///./arvr_integration.db`) |
| `CORS_ORIGINS` | No | Comma-separated frontend origins (default: localhost 3000 / 5173) |
| `ASSETS_DIR` / `MODELS_DIR` / `TEXTURES_DIR` | No | Asset folders, created on startup |
| `APP_NAME` / `APP_VERSION` / `DEBUG` | No | Service identity and SQL echo |

The four `*_BASE_URL` defaults are identical, so they are "required" in practice whenever more than one project runs on one machine.

---

## Status

| Component | Status |
|---|---|
| Batisse — floor plan → validated geometry → GLB | ✅ Standalone project |
| WYA — wardrobe, outfits, style profile | ✅ Standalone project |
| TryOn — cutouts, mannequin, outfit builder, optional CatVTON | ✅ Standalone project |
| Velaris — jewellery design, CAD, PDF, DXF | ✅ Standalone project |
| Luna — conversational styling over WYA | ✅ Standalone project |
| `ar-vr` gateway, service adapters, shared schemas | 🟡 Phase 1 foundation — runs, but health, Luna and several adapter calls are broken |
| `ar-vr` navigation / room / door / window routes | 🟡 Stubs — return success, store nothing |
| `ar-vr/frontend` | 🟡 Scaffold — does not build yet |
| Coordination DB writes (room assignments, saved looks) | 🔲 Table exists, nothing writes to it |
| Cross-project user identity / auth coordination | 🔲 Planned |
| Unified 3D virtual-home front end (walkthrough, room navigation) | 🔲 Planned |
| Wardrobe / fitting-room / boutique placed inside the 3D home | 🔲 Planned |
| Save complete look (clothing + jewellery) | 🔲 Stub |
| AR / VR (OpenXR) | 🔲 Future |

---

## Known Limitations

- **The unified 3D experience is not built yet.** `ar-vr/frontend` now exists, but it is a scaffold: no 3D scene, no room navigation UI, and the walkthrough you see in the pitch is the target. The planned `blender/`, `ar/` and `vr/` directories described in `ar-vr/README.md` still do not exist. The only working 3D dollhouse viewer is in Batisse's own frontend.
- **`ar-vr/frontend` does not build.**
  - `react`, `react-dom` and `react-router-dom` are imported but missing from `package.json`.
  - `main.tsx` uses `React.StrictMode` without importing `React`.
  - `App.tsx` passes functions as `<Route element={...}>`, which React Router does not accept, and every page fires its API call on mount *and* on button click.
  - It targets `http://127.0.0.1:8001`, which is Luna's port, not the gateway's.
  - Request bodies do not match the gateway signatures (for example `/api/tryon/generate` expects `garment_image_url`, `avatar_params` and `user_id`).
- **Gateway has known bugs to fix before it works end to end.**
  - `/api/health` imports from `ar_vr.backend.services`, which is not importable, so it reports every service `unreachable` regardless of reality.
  - Startup health checks are misleading: adapter `ping()` swallows errors and returns `False`, but the lifespan code ignores the return value and logs "reachable" anyway; TryOn is marked reachable without any check.
  - `/api/tryon/status` is hard-coded (`healthy`) and never contacts TryOn; the adapter method `get_tryon_status()` it was meant to call references an undefined `user_id`.
  - `/api/luna/chat` references `WYA_BASE_URL`, which is not defined in `main.py`, so it always returns an error reply. It also posts to `/luna-api/chat`, while WYA's Luna router is mounted at `/api/luna/chat`.
  - Adapters use hard-coded `http://127.0.0.1:8000` instead of the values in `config.py`.
  - The `POST` wardrobe and try-on routes declare plain query parameters, while the tests send JSON bodies.
  - Navigation, room, door, window, assign-room-function and save-look routes are stubs. They return `success: true` without storing anything, so a client cannot tell them from working endpoints.
  - `models.py` and `api/` listed in `ar-vr/README.md` are not present; `slowapi` is installed but not wired.
  - The test suite is red when no downstream services are running (12 passed, 11 failed).
- **Service URLs collide by default.** All four adapters default to `127.0.0.1:8000`.
- **Auth is not coordinated.** Each project keeps its own auth: WYA uses JWT, TryOn uses a guest `X-User-Id` header. `INTEGRATION_JWT_SECRET` is configured but unused, and its default must not be used in production.
- **Some adapters call endpoints the target does not expose under that name** — for example, `find_similar` calls `/api/similar` while Velaris serves `/api/find-similar`, and `list_designs` reads `/api/trends`, which is trend data, not saved designs.
- **TryOn is image-based.** No 3D garment simulation, rigging or cloth physics.
- **Velaris is 2D.** Designs, CAD views, PDFs and DXF files — no 3D jewellery meshes, and CAD output is a concept drawing, not manufacturing-validated.
- **Batisse is classical CV.** Detection quality depends on plan quality; scale must be confirmed by the user.
- **Hosted demos are paused.** WYA and Luna backends are switched off to manage AWS cost.
- **Local only.** No unified Docker setup for the whole platform.

---

## Future Scope

| Feature | Why |
|---|---|
| Fix and finish the `ar-vr` gateway | Working health checks, correct adapter calls, config-driven URLs, real persistence behind the navigation and room routes |
| Make `ar-vr/frontend` build and render | Declare dependencies, fix routing, point at the gateway, replace button demos with a Three.js scene |
| Single sign-in across projects | One identity for Batisse, WYA, TryOn, Velaris and Luna |
| Unified 3D front end (React + Three.js) | Walk through the user's own home with keyboard and mouse |
| Room functions in 3D | Bedroom → wardrobe, study → jewellery boutique, hallway → fitting room |
| Luna inside the virtual home | Styling assistant available in every room |
| 3D garments and jewellery | Move from image previews to meshes that can sit in the scene |
| Save complete looks | Clothing + jewellery stored as one outfit |
| AR / VR (OpenXR) | Headset and marker-based AR |
| Docker Compose + PostgreSQL | Reproducible one-command deployment |

---

## License

Each component keeps its own licence. WYA is source-available under **PolyForm Strict 1.0.0** (non-commercial, no redistribution, no derivatives) — see `WYA-Whats-Your-Aesthetic-main/LICENSE.md`. Check each project's folder before reusing code.

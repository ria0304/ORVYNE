# ar-vr — Integration Layer

**ORVYNE** — Personal Virtual Home & Lifestyle Universe

This directory contains the integration layer that connects the four existing projects (BATISSE, WYA, TryOn, VELARIS) into a unified virtual experience. The original projects remain independent and unchanged.

## Purpose

The `ar-vr` integration backend provides:

- **API gateway** — Coordinates inter-project communication between BATISSE, WYA, TryOn, and VELARIS
- **Authentication coordination** — Secure service-to-service auth without exposing user tokens
- **Shared schemas** — Common types for user references, room metadata, and asset references
- **3D environment coordination** — Load and navigate generated houses, wardrobes, fitting rooms, and jewellery boutiques
- **Data flow orchestration** — Coordinate BATISSE → virtual home, WYA → wardrobe, TryOn → fitting room, VELARIS → boutique

## Directory Structure

```
ar-vr/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI integration entry point
│   │   ├── config.py            # Environment-based configuration
│   │   ├── database.py          # Shared SQLite (initial) / PostgreSQL later
│   │   ├── models.py            # Shared SQLAlchemy models
│   │   ├── api/
│   │   │   ├── house.py         # BATISSE geometry integration
│   │   │   ├── wardrobe.py      # WYA wardrobe integration
│   │   │   ├── tryon.py         # TryOn fitting room integration
│   │   │   └── jewellery.py     # VELARIS jewellery boutique integration
│   │   └── services/            # Coordination services
│   ├── requirements.txt         # ar-vr specific dependencies
│   └── scripts/                 # Helper scripts
├── frontend/
│   ├── src/
│   │   ├── environments/        # 3D environment scenes
│   │   ├── virtual-home/        # Generated house navigation
│   │   ├── neighbourhood/       # Street/path layout
│   │   ├── room-navigation/     # Room transition system
│   │   ├── interactions/        # Generic interaction handlers
│   │   ├── wardrobe/            # WYA wardrobe integration UI
│   │   ├── fitting-room/        # TryOn fitting room UI
│   │   ├── jewellery-boutique/  # VELARIS integration UI
│   │   ├── avatar/              # Avatar management
│   │   └── components/          # Reusable 3D/UI components
│   └── public/
│       ├── models/              # GLB/glTF assets
│       ├── textures/            # Texture images
│       ├── environments/        # Sky/environment maps
│       └── audio/               # Spatial audio assets
├── blender/
│   ├── scripts/                 # Python scripts for 3D automation
│   ├── house_generation/        # Blender python automation
│   ├── furniture/               # Furniture library
│   ├── jewellery/               # Jewellery asset processing
│   └── asset_processing/        # trimesh/Open3D processing
├── ar/                          # AR implementation (future)
│   └── placeholder/             # OpenXR, marker-based AR
├── vr/                          # VR implementation (future)
│   └── placeholder/             # OpenXR, controller handling
├── shared/
│   ├── schemas/                 # Pydantic shared schemas
│   ├── asset_formats/           # GLB/glTF handling utilities
│   └── utilities/               # Common Python utilities
├── tests/                       # Integration tests with mocked external services
└── assets/                      # 3D models, textures (procedurally generated)
```

## Integration Philosophy

- **Independence first**: Each existing project (BATISSE, WYA, TryOn, VELARIS) remains a fully independent application with its own database, APIs, and business logic.
- **Integration via adapters**: The ar-vr backend connects to existing projects via their verified REST APIs — no code duplication, no merged databases.
- **Incremental development**: Start with Phase 1 integration foundation, then progressively add virtual home, wardrobe, fitting room, and boutique features.
- **Security by design**: Service-to-service authentication uses API keys stored in environment variables; user tokens never exposed across services.
- **Technology Python-first**: The integration layer is Python/FastAPI central; the frontend uses React + TypeScript + Vite + Three.js.

## Phase 1 — Integration Foundation

See the `backend/app/main.py` for the initial FastAPI setup. This phase establishes:
- Environment-based configuration
- Shared Pydantic schemas
- Health checks
- Service adapters with mocked external services
- Integration test suite

## Development

```bash
# From the vr/ root directory
cd ar-vr/backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend will be available at `http://127.0.0.1:8000`
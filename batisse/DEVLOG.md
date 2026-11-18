# Bâtisse — Development Log

## Repository audit (completed before implementation)

### Existing architecture
- **Backend**: FastAPI + SQLAlchemy 2 over SQLite. OpenCV / PyMuPDF / Pillow for plan loading & preprocessing; classical CV detector (walls, rooms, opening-gap candidates); Tesseract OCR for labels + dimensions; Shapely geometry builder (shared walls, T-junctions, footprint, validation); versioned `FloorPlanGeometry` (v1) stored as JSON on the `Project` table. Uniform `{"error": {...}}` API error format. Stateless `/geometry/rebuild` for live edits.
- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS 4, Three.js / `@react-three/fiber` / `@react-three/drei`, `react-router-dom`, Zustand. Typed API client mirroring backend schemas. Zustand stores: `useAppStore` (projects/uploads/geometry), `useGeometryEditor` (working geometry, selection, dirty flag, undo/redo stack). Pages: dashboard, project workspace (plan/processing/scale/geometry/viewer tabs). 3D: `DollhouseViewer`, `BuildingModel` (actual segmented wall openings — not decals), `CameraControls`, `materials`. `PlanEditor` SVG 2D editor (zoom/pan, select, draw wall, add/move/delete openings, grid/snap, undo/redo, inspector) was fully coded but **not wired into the workspace**.

### Implemented functionality
- Plan upload (JPG/PNG/PDF with magic-byte sniffing, size limits, extension-vs-content validation), multi-page PDF, preview images.
- Preprocessing: resize, perspective correction, deskew, ink mask.
- Classical wall/room/opening detection with per-element provenance + confidence.
- OCR room labels + dimension parsing (PDF text layer or Tesseract).
- Scale proposals from labels/drawing ratio; user scale reference (two points + real length); never auto-applied.
- Deterministic geometry rebuild: derived shared walls, T-junctions, L-shapes, opening snapping, footprint, areas.
- Geometry validation (errors/warnings/info); errors block save + 3D.
- Persistent projects/uploads/processing runs (SQLite).
- Typed frontend API client + schema types.
- 3D dollhouse viewer with orbit controls, wall/floor/roof layers, slab + room floors + segmented walls with actual openings.
- `PlanEditor` interactive 2D SVG editor + `useGeometryEditor` undo/redo.

### Incomplete functionality
- `PlanEditor` not connected to the workspace geometry tab (static text panel shown instead).
- No 2D↔3D selection synchronisation.
- No 3D→2D click-to-select.
- No furniture asset / instance / scene-configuration schema or API.
- No furniture library, placement UI, or collision/fit checking.
- No furniture-related frontend code at all.

### Technical debt / risks
- Frontend `index.css` exists but Tailwind is driven by `@tailwindcss/vite`; verify design tokens are applied consistently.
- Frontend is partial per README (editor + 3D viewer UI not fully integrated) — now being resolved.

### Recommended implementation sequence
Follow the roadmap: Stage A (foundation) → Stage B (2D editor) → ... We began at Stage B/E: wire the editor + synchronise 2D↔3D selection.

---

## Stage B/E — Interactive 2D editor + 2D↔3D selection synchronisation (this session)

### What was implemented
1. Wired `PlanEditor` into `ProjectWorkspacePage` geometry tab, replacing the static `GeometryPanel`/`GeometryView` text panels.
2. Removed dead `GeometryPanel`/`GeometryView` and duplicate `parsePair`.
3. `BuildingModel` now accepts `selectedElement` and highlights the matching room wall/opening mesh in 3D (bronze/accent highlight + emissive).
4. `DollhouseViewer` reads `selectedElement` from `useGeometryEditor`, passes it to `BuildingModel`, and performs raycast-based selection on canvas click: clicking a room/wall/opening in 3D dispatches `setSelection` to the shared geometry editor store (3D→2D). Clicking in the 2D `PlanEditor` updates the same store (2D→3D), so selection is bidirectional.

### Files modified
- `frontend/src/pages/ProjectWorkspacePage.tsx` — import + render `PlanEditor` on geometry tab; remove `GeometryPanel`/`GeometryView`/duplicate `parsePair`.
- `frontend/src/three/BuildingModel.tsx` — accept `selectedElement`, highlight matching meshes, import `EditorState` type.
- `frontend/src/three/DollhouseViewer.tsx` — wire `useGeometryEditor` selection + `useThree` raycaster for click-to-select; view/layer UI retained.

### Files created
- None (all edits to existing files).

### Existing functionality preserved
- All backend APIs and behaviour unchanged.
- All frontend pages/hooks/stores/API client retained.
- `PlanEditor` behaviour unchanged; now actually mounted.

### Database/API changes
- None.

### Tests executed & results
- Backend: `pytest` → **44 passed, 1 skipped** (no regressions).
- Frontend: `tsc --noEmit` → clean. `vitest run` → **7 passed, 7 failed = 0**.
- Frontend production build: `npm run build` → success (single non-fatal chunk-size warning).

### Known limitations
- Highlight colour is a fixed accent; not yet theme-driven.
- 3D→2D raycast selects the topmost intersected mesh; wall segments and opening frames are pickable, grid/lights are not.
- Selection is single-element only (no multi-select).
- `PlanEditor` draws walls as raw `Wall` records (not yet room-boundary-aware); room polygon vertex dragging not yet implemented.
- Furniture asset/instance architecture not yet implemented (Stage H).

### Brand gradient (this session)
- Defined `--color-gradient` CSS custom property (`linear-gradient(to right, #6BB1AD, #A7BCBD, #EDECEB, #E5A9A9, #E6748E)`) plus `brand-gradient` (text) and `brand-gradient-bg` (background) utilities in `frontend/src/index.css`.
- Applied `brand-gradient` to the Layout logo ("BÂTISSE") and the Dashboard "Projects" heading.
- Applied `brand-gradient-bg` to the Dashboard "Create project" primary button.
- Applied `brand-gradient-bg` to the active workspace tab in `ProjectWorkspacePage`.
- Main architectural workspace (2D editor + 3D viewer) kept neutral for clear editing; gradient reserved for brand identity, dashboard highlights, and selected interface accents.

### Remaining work / recommended next milestone
- Stage D: geometry validation panel (frontend validation already exists in `utils/validation.ts`; wire a validation panel into the workspace).
- Stage H: furniture asset + instance schemas (backend models + API), furniture library, manual placement, independent instances.
- Stage A foundation pieces still outstanding: furniture asset/instance/scene-configuration schemas, schema versioning/migration strategy, shared transformation utilities documentation.

---

## Known Limitations (from audit)

### Architectural reconstruction
- **Classical detector, not ML.** Works for plans with solid or thick, roughly axis-aligned walls. Thin double-line walls, curved walls and diagonal walls are not reliably supported; the report says so.
- **Door/window detections are gap candidates.** Unverified, flagged `needs_review`, use default heights (2.1 m doors, 1.2 m windows, 0.9 m sill).
- **Vertical dimensions are assumptions.** Wall height (default 2.7 m), door height, sill height and slab thickness are adjustable defaults, not read from the plan.
- **Scale is never guessed.** Without OCR dimensions, a drawing ratio or a user reference, geometry stays in pixels and 3D is blocked. A drawing ratio assumes the PDF is at its intended print size.
- **PDF vector geometry is not measured.** PDFs are rendered to an image and measured from pixels; the vector path count is reported but not used.
- **Not interpreted:** stairs, furniture, fixtures and annotations.
- **One page = one floor.** Multi-storey plans are not split automatically.
- **Confidence scores are heuristics**, not calibrated probabilities.
- **OCR needs Tesseract** for image inputs; accuracy on photos and low-resolution scans can be poor.

### Frontend (editor/viewer)
- **Editor mounts but stays empty.** `PlanEditor` reads geometry from `useGeometryEditor`, but nothing copies processed geometry from `useAppStore` into that store, so it shows "No geometry loaded". Its hooks are declared after an early return, which breaks React's rules of hooks if state changes.
- **Rendered twice on the Geometry tab** (sidebar and main area).
- **3D click-to-select likely broken.** `DollhouseViewer` calls `useThree()` in the component that renders `<Canvas>`, outside the canvas — R3F throws "Hooks can only be used within the Canvas component".
- **Dollhouse controls are placeholders.** Reset/Top/Dollhouse buttons have empty handlers; Walls/Floors/Roof checkboxes change local state `BuildingModel` never reads; the panel has `pointer-events-none` so it cannot be clicked; no roof geometry.
- **No 2D validation panel.** `utils/validation.ts` exists but is not shown anywhere in the workspace.
- **Processing fixed to first upload, page 0.** No page picker in the UI; re-running detection is blocked by the 409 (backend supports both).
- **Dashboard navigation bug.** "New Project"/"Create project" buttons navigate to `/new`, which has no route and renders the 404 page; the inline form works correctly.
- **Frontend test coverage is thin.** The 7 Vitest tests cover the API client and type constants only; the editor, viewer and pages are untested.

### Furniture
- Furniture asset/instance/scene-configuration architecture not yet implemented (Stage H). No furniture library, placement UI, or collision/fit checking.

## Future Scope (from audit)
- Learned wall segmentation (CubiCasa5K-style) — handle thin-outline, curved and diagonal walls (`requirements-ai.txt` reserved).
- Measure PDF vector geometry directly — exact walls/scale for CAD-exported PDFs.
- Multi-floor projects — split multi-storey sheets and stack floors with real elevations.
- Stairs, furniture and fixture detection.
- Export to glTF/OBJ.
- Docker + Postgres.
- Retail furniture product try-on (architecture must support it, integrations not yet implemented).


## Milestone: Geometry Validation, Furniture Architecture & Dollhouse Foundation

### What was implemented

**Priority 1 — Geometry validation experience**
- New `frontend/src/components/geometry/ValidationPanel.tsx`: dedicated panel showing validation status, error/warning/info counts, and a scrollable list of findings. Clicking a finding calls `onSelectIssue`, which maps the ref to a room/wall/opening selection in the shared `useGeometryEditor` store (highlights in 2D and 3D).
- Wired into `ProjectWorkspacePage` as a "Validation" tab (sidebar panel + main view).
- Reuses existing `validateGeometry`/`issueCounts` from `utils/validation.ts` (no duplicated logic).

**Priority 2 — Shared architectural editor**
- Fixed `PlanEditor` React rules-of-hooks violation: split into outer `PlanEditor` (syncs processed geometry from `useAppStore` into `useGeometryEditor`, loading gate) and inner `PlanEditorInner` (all hooks unconditional).
- Removed duplicate `PlanEditor` render on the Geometry tab (now only in main canvas).
- `DollhouseViewer`: moved `useThree()` into a `ScenePointer` child of `<Canvas>` so R3F hooks are valid; 3D click-to-select now works.
- Wired layer visibility (`showWalls`/`showFloors`) into `BuildingModel` (conditionally builds those meshes) and removed `pointer-events-none` from the control panel so buttons/checkboxes are clickable.
- Fixed dashboard navigation bug: "New Project"/"Create project" buttons now scroll to and focus the creation form instead of navigating to the non-existent `/new` route.

**Priority 3 & 4 — Reusable furniture architecture + backend API**
- `backend/app/models.py`: added `FurnitureAsset`, `FurnitureInstance`, `SceneConfiguration` models with full field sets (dimensions, pivot, bbox, materials, textures, reconstruction metadata, source type, transforms, placements). Added relationships to `Project`.
- `backend/app/schemas.py`: added typed Pydantic schemas for asset/instance/scene-config CRUD (including `FurnitureCategory`, `FurnitureSource`, `FurnitureReconMethod` literals). Restored `GeometryRebuildRequest`.
- `backend/app/routers/furniture.py`: full CRUD for assets, instances (create/list/get/update/delete, ownership/project validation), and scene configurations (create/list/get/update/duplicate/delete).
- Registered `furniture.router` in `main.py`.

**Priority 5 — Furniture library frontend**
- New `frontend/src/pages/FurnitureLibraryPage.tsx`: gallery grid with search, category filter, empty state, create/delete actions, model-availability indicator.
- Route `/furniture` in `App.tsx`; "Furniture Library" link in `Layout.tsx` sidebar.
- `frontend/src/api/types.ts` + `client.ts`: added furniture types and API methods.

**Priority 9 — Scene configuration foundation**
- Backend `SceneConfiguration` model + schemas + CRUD endpoints (create/list/get/update/duplicate/delete) implemented.

### Files created
- `frontend/src/components/geometry/ValidationPanel.tsx`
- `frontend/src/pages/FurnitureLibraryPage.tsx`
- `backend/app/routers/furniture.py`
- `backend/tests/test_furniture.py`

### Files modified
- `frontend/src/components/geometry/PlanEditor.tsx` (hooks fix, sync, inner split)
- `frontend/src/pages/ProjectWorkspacePage.tsx` (validation tab, handleSelectIssue, removed duplicate PlanEditor render)
- `frontend/src/three/DollhouseViewer.tsx` (ScenePointer, layer wiring, removed pointer-events-none)
- `frontend/src/three/BuildingModel.tsx` (showWalls/showFloors props)
- `frontend/src/pages/DashboardPage.tsx` (navigation fix)
- `frontend/src/components/common/Input.tsx` (forwardRef)
- `frontend/src/api/types.ts`, `frontend/src/api/client.ts`
- `frontend/src/App.tsx`, `frontend/src/components/layout/Layout.tsx`
- `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/main.py`

### Tests executed & results
- Backend: `pytest` -> **47 passed, 1 skipped** (added 3 furniture tests: asset CRUD, instance independence across projects, scene config CRUD/duplicate).
- Frontend: `tsc --noEmit` clean; `vitest run` -> **7 passed**; `npm run build` success.

### Known limitations
- Furniture library uses placeholder "New Asset" creation (manual metadata only); no GLB/GLTF import or 3D placement UI yet (Stage H).
- `PlanEditor` still does not support room-polygon vertex dragging; wall drawing adds raw walls.
- Layer checkboxes (Roof) have no geometry yet.
- Processing still fixed to first upload/page 0 (no page picker).
- Frontend furniture types use `Partial<FurnitureAsset>` for create/update (loose typing).
- No migration framework; schema changes rely on `create_all` (additive only).

### Recommended next milestone
- GLB/GLTF furniture import + 3D placement with independent instance transforms.
- Furniture placement transform UI (drag/rotate/scale) and persistence.
- Scene configuration switching UI.
- Geometry validation panel polish + re-run on edit.
- Frontend test coverage for editor/viewer/pages.

## Milestone 2: Reusable 3D Furniture Import, Placement & Scene Management

### What was implemented

**Phase 1 — Backend import, secure storage, serving**
- `config.py`: added `ASSET_DIR = DATA_DIR / "assets"` and ensure_dirs creation.
- `models.py`: added `dimensions_confirmed` boolean to `FurnitureAsset`.
- `schemas.py`: added `dimensions_confirmed` to create/update/out; added `lighting`/`decor` categories.
- `routers/furniture.py`: `POST /furniture/assets/import` (multipart, validates ext/size/GLB magic/self-contained GLTF, stores under `ASSET_DIR/{id}/`, creates asset with model_path), `GET /furniture/assets/{id}/model` (FileResponse with path-traversal guard), delete cleans up asset dir.
- Tests: invalid ext, GLB import + serve, external-dep GLTF rejection, self-contained GLTF accept, delete cleanup.

**Phase 2 — Frontend upload, preview, asset details**
- `ModelPreview` component (R3F canvas, useGLTF, orbit, grid, dimension extraction callback).
- `FurnitureLibraryPage`: import flow with file picker, progress, navigation to detail.
- `FurnitureAssetDetailPage`: preview + metadata form, dimensions_confirmed checkbox, save/delete.
- Route `/furniture/:id` added; client methods `importFurnitureAsset`, `furnitureModelUrl`.

**Phase 3 — Furniture store, 3D placement, transforms, persistence**
- `useFurnitureStore`: instances, assets, selectedInstanceId, sceneConfigs, currentSceneId, loading/saving/error, CRUD, persist, duplicate.
- `FurnitureLayer`: renders GLB instances via useGLTF (cloned), TransformControls on selected, persists transform on drag-end.
- `FurnitureControlsPanel`: transform mode buttons, snap toggle, add-to-scene (asset + room), selected instance properties, duplicate/delete.
- `DollhouseViewer` renders FurnitureLayer inside Canvas; ScenePointer handles furniture click selection.
- `ProjectWorkspacePage`: furniture tab, loads instances/scenes on project select, transform end persists.

**Phase 4 — Scene configuration interface & switching**
- Scene selector, save current arrangement as named scene, duplicate, delete, apply (snapshot-based: replaces current instances).
- Unsaved-arrangement protection via confirm dialog before replace.

**Phase 5 — 2D footprints & spatial validation**
- PlanEditor renders rotated rectangular furniture footprints, selectable.
- `utils/furnitureValidation.ts`: overlap, outside-room, wall intersection, door blocking, estimated-dimensions warnings.
- ValidationPanel merges furniture issues; clicking a numeric ref selects the furniture instance.

**Phase 6 — UI polish, tests, DEVLOG**
- Frontend test: furnitureValidation overlap case.
- Backend: 48 passed, 1 skipped.
- Frontend: typecheck clean, 8 tests passed, build success.

### Files created
- `frontend/src/store/useFurnitureStore.ts`
- `frontend/src/three/FurnitureLayer.tsx`
- `frontend/src/components/furniture/ModelPreview.tsx`
- `frontend/src/components/furniture/FurnitureControlsPanel.tsx`
- `frontend/src/pages/FurnitureAssetDetailPage.tsx`
- `frontend/src/utils/furnitureValidation.ts`
- `frontend/src/__tests__/furnitureValidation.test.ts`

### Files modified
- `backend/app/config.py`, `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/routers/furniture.py`
- `backend/tests/test_furniture.py`
- `frontend/src/api/types.ts`, `frontend/src/api/client.ts`
- `frontend/src/App.tsx`
- `frontend/src/three/DollhouseViewer.tsx`, `frontend/src/components/geometry/PlanEditor.tsx`, `frontend/src/components/geometry/ValidationPanel.tsx`
- `frontend/src/pages/ProjectWorkspacePage.tsx`, `frontend/src/pages/FurnitureLibraryPage.tsx`

### Tests executed & results
- Backend: `pytest` -> **48 passed, 1 skipped**.
- Frontend: `tsc --noEmit` clean; `vitest run` -> **8 passed**; `npm run build` success.

### Known limitations
- Thumbnails are category placeholders; live preview only on detail page.
- Scene switching replaces instances (new IDs) rather than preserving IDs.
- Transform snap checkbox is UI-only (not yet applied to TransformControls).
- No multi-file .gltf companion bundle support (external-dep .gltf rejected).
- No automated browser/E2E tests; manual verification required.
- Furniture 2D footprint rotation uses yaw only (pitch/roll ignored, as expected for floor placement).

### Recommended next milestone
- Apply grid snap to TransformControls; add thumbnail capture.
- Multi-file GLTF bundle support.
- Furniture material override UI.
- E2E/browser tests.
- Performance: instancing/cloning optimization for many assets.

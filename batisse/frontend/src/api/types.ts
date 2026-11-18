// Mirrors backend/app/geometry/schema.py and backend/app/schemas.py
export type Pt = [number, number]
export type RoomType =
  | 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'dining'
  | 'hallway' | 'balcony' | 'utility' | 'storage' | 'other'
export const ROOM_TYPES: RoomType[] = [
  'living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'hallway', 'balcony', 'utility', 'storage', 'other',
]
export type Provenance = 'manual' | 'detected' | 'derived'
export type OpeningType = 'door' | 'window'
export type Units = 'px' | 'm'
export type ScaleSource = 'unknown' | 'user_reference' | 'ocr_dimension' | 'vector' | 'manual'

export interface Scale {
  meters_per_pixel: number | null
  source: ScaleSource
  confidence: number
  note?: string | null
}
export interface Room {
  id: string
  name: string
  room_type: RoomType
  polygon: Pt[]
  source: Provenance
  confidence: number
  label_text?: string | null
  color?: string | null
  area: number
  width: number
  depth: number
}
export interface Wall {
  id: string
  start: Pt
  end: Pt
  thickness: number
  height: number
  exterior: boolean
  color?: string | null
  room_ids: string[]
  source: Provenance
  confidence: number
  length: number
}
export interface Opening {
  id: string
  type: OpeningType
  position: Pt
  width: number
  height: number
  sill_height: number
  source: Provenance
  confidence: number
  needs_review: boolean
  wall_id?: string | null
  offset?: number | null
}
export interface Floor {
  id: string
  name: string
  level: number
  elevation: number
  wall_height: number
  wall_thickness: number
  slab_thickness: number
  rooms: Room[]
  walls: Wall[]
  openings: Opening[]
  footprint: Pt[][]
}
export interface Issue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  ref?: string | null
}
export interface FloorPlanGeometry {
  version: number
  units: Units
  scale: Scale
  image_size: [number, number] | null
  floors: Floor[]
  issues: Issue[]
}

export interface Project {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
  upload_count: number
  room_count: number
  has_geometry: boolean
  units: Units | null
  ready_for_3d: boolean
}
export interface UploadInfo {
  id: number
  project_id: number
  original_name: string
  kind: 'png' | 'jpeg' | 'pdf'
  size_bytes: number
  page_count: number
  width: number
  height: number
  created_at: string
}
export interface ScaleProposal {
  source: 'ocr_dimension' | 'vector'
  meters_per_pixel: number
  confidence: number
  evidence: string[]
}
export interface ProcessingReport {
  detector: string
  is_ml_model: boolean
  input_kind: string
  page_index: number
  page_count: number
  image_size: [number, number]
  pdf_vector_paths: number
  preprocess: { name: string; applied: boolean; detail: string; confidence: number | null }[]
  detection_mode: string
  wall_thickness_px: number
  wall_coverage: number
  rooms_found: number
  openings_found: number
  ocr_engine: string
  ocr_available: boolean
  ocr_note: string
  text_lines_read: number
  text_matches: { text: string; kind: 'room_label' | 'dimension'; room_id: string | null; confidence: number }[]
  scale_proposals: ScaleProposal[]
  overall_confidence: number | null
  warnings: string[]
  not_attempted: string[]
}
export interface GeometryResponse {
  geometry: FloorPlanGeometry
  revision: number
  ready_for_3d: boolean
  has_plan_image: boolean
}
export interface ProcessResponse {
  run_id: number
  geometry: FloorPlanGeometry
  report: ProcessingReport
}
export type FurnitureCategory =
  | 'sofa' | 'bed' | 'chair' | 'table' | 'wardrobe' | 'cabinet' | 'shelf' | 'desk' | 'dresser'
  | 'lighting' | 'decor' | 'other'
export type FurnitureSource = 'single_photo' | 'multi_view' | 'retail_image' | 'imported_model' | 'manual'
export type FurnitureReconMethod = 'manual' | 'single_image' | 'multi_view' | 'imported'

export interface FurnitureAsset {
  id: number
  name: string
  category: FurnitureCategory
  description: string
  image_refs: string[]
  model_path: string | null
  width: number
  height: number
  depth: number
  units: string
  pivot_x: number
  pivot_y: number
  pivot_z: number
  bbox_min_x: number | null
  bbox_min_y: number | null
  bbox_min_z: number | null
  bbox_max_x: number | null
  bbox_max_y: number | null
  bbox_max_z: number | null
  materials: Record<string, unknown>
  textures: Record<string, unknown>
  reconstruction_method: string
  reconstruction_confidence: number | null
  dimensions_confirmed: boolean
  source_type: FurnitureSource
  created_at: string
  updated_at: string
}

export interface FurnitureInstance {
  id: number
  asset_id: number
  project_id: number
  floor_id: string
  room_id: string | null
  pos_x: number; pos_y: number; pos_z: number
  rot_x: number; rot_y: number; rot_z: number
  scale_x: number; scale_y: number; scale_z: number
  material_overrides: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface SceneConfiguration {
  id: number
  project_id: number
  name: string
  placements: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in'

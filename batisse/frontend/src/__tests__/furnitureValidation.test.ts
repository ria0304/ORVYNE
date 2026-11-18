import { describe, it, expect } from 'vitest'
import { validateFurniture } from '../utils/furnitureValidation'
import type { FloorPlanGeometry } from '../api/types'
import type { FurnitureInstance } from '../api/types'
import type { FurnitureAsset } from '../api/types'

describe('validateFurniture', () => {
  it('flags overlapping instances', () => {
    const geometry = {
      version: 1, units: 'm', scale: { meters_per_pixel: 1, source: 'manual', confidence: 1 },
      image_size: null, floors: [{ id: 'floor-0', name: 'g', level: 0, elevation: 0, wall_height: 2.7, wall_thickness: 0.15, slab_thickness: 0.15, rooms: [], walls: [], openings: [], footprint: [] }], issues: [],
    } as unknown as FloorPlanGeometry
    const assets = new Map<number, FurnitureAsset>()
    const insts: FurnitureInstance[] = [
      { id: 1, asset_id: 1, project_id: 1, floor_id: 'floor-0', room_id: null, pos_x: 0, pos_y: 0, pos_z: 0, rot_x: 0, rot_y: 0, rot_z: 0, scale_x: 1, scale_y: 1, scale_z: 1, material_overrides: null, created_at: '', updated_at: '' },
      { id: 2, asset_id: 1, project_id: 1, floor_id: 'floor-0', room_id: null, pos_x: 0.1, pos_y: 0, pos_z: 0.1, rot_x: 0, rot_y: 0, rot_z: 0, scale_x: 1, scale_y: 1, scale_z: 1, material_overrides: null, created_at: '', updated_at: '' },
    ]
    assets.set(1, { id: 1, name: 'a', category: 'chair', description: '', image_refs: [], model_path: null, width: 1, height: 1, depth: 1, units: 'm', pivot_x: 0, pivot_y: 0, pivot_z: 0, bbox_min_x: null, bbox_min_y: null, bbox_min_z: null, bbox_max_x: null, bbox_max_y: null, bbox_max_z: null, materials: {}, textures: {}, reconstruction_method: 'manual', reconstruction_confidence: null, dimensions_confirmed: false, source_type: 'manual', created_at: '', updated_at: '' })
    const issues = validateFurniture({ instances: insts, assets, geometry })
    expect(issues.some((i) => i.code === 'furniture_overlap')).toBe(true)
  })
})
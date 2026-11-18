import { describe, it, expect } from 'vitest'
import {
  ROOM_TYPES,
  type RoomType,
  type ScaleSource,
  type Units,
} from '../api/types'

describe('types', () => {
  it('ROOM_TYPES contains the expected room types', () => {
    expect(ROOM_TYPES).toContain('living')
    expect(ROOM_TYPES).toContain('kitchen')
    expect(ROOM_TYPES).toContain('bathroom')
    expect(ROOM_TYPES.length).toBe(10)
  })

  it('room type values match ROOM_TYPES', () => {
    const values: RoomType[] = ['living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'hallway', 'balcony', 'utility', 'storage', 'other']
    values.forEach((v) => expect(ROOM_TYPES).toContain(v))
  })

  it('scale source and units literals are valid', () => {
    const sources: ScaleSource[] = ['unknown', 'user_reference', 'ocr_dimension', 'vector', 'manual']
    sources.forEach((s) => expect(['unknown', 'user_reference', 'ocr_dimension', 'vector', 'manual']).toContain(s))

    const units: Units[] = ['px', 'm']
    units.forEach((u) => expect(['px', 'm']).toContain(u))
  })
})

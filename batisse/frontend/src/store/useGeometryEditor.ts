/**
 * Geometry editor store.
 *
 * Holds the editable working copy of the project geometry, the current
 * selection, unsaved-changes flag, and an undo/redo stack.
 *
 * The shared geometry model lives here. Both the 2D editor and the 3D
 * viewer read from it. Mutations go through actions that push to the undo
 * stack and mark the document dirty.
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  FloorPlanGeometry,
  Floor,
  Room,
  Wall,
  Opening,
  Issue,
} from '../api/types'

export interface EditorState {
  // Working geometry
  geometry: FloorPlanGeometry | null
  setGeometry: (g: FloorPlanGeometry) => void
  replaceGeometry: (g: FloorPlanGeometry) => void

  // Selection
  selectedElement: { type: 'room'; id: string } |
    { type: 'wall'; id: string } |
    { type: 'opening'; id: string } |
    { type: 'floor'; id: string } |
    null
  setSelection: (sel: EditorState['selectedElement']) => void
  clearSelection: () => void

  // Dirty / persistence
  dirty: boolean
  setDirty: (d: boolean) => void
  markSaved: () => void
  markUnsaved: () => void

  // Undo / redo
  undoStack: FloorPlanGeometry[]
  redoStack: FloorPlanGeometry[]
  canUndo: boolean
  canRedo: boolean
  pushState: (g: FloorPlanGeometry) => void
  undo: () => FloorPlanGeometry | null
  redo: () => FloorPlanGeometry | null
  clearHistory: () => void

  // Helpers
  getFloor: (floorId: string) => Floor | undefined
  getRoom: (roomId: string) => Room | undefined
  getWall: (wallId: string) => Wall | undefined
  getOpening: (openingId: string) => Opening | undefined
  getIssuesForRef: (ref: string | undefined) => Issue[]
}

const MAX_HISTORY = 50

export const useGeometryEditor = create<EditorState>()(
  devtools((set, get) => ({
    geometry: null,
    setGeometry: (g) => set({ geometry: g, dirty: true }),
    replaceGeometry: (g) => set({ geometry: g, dirty: false }),

    selectedElement: null,
    setSelection: (sel) => set({ selectedElement: sel }),
    clearSelection: () => set({ selectedElement: null }),

    dirty: false,
    setDirty: (d) => set({ dirty: d }),
    markSaved: () => set({ dirty: false }),
    markUnsaved: () => set({ dirty: true }),

    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,

    pushState: (g) =>
      set((state) => {
        const stack = [...state.undoStack, g].slice(-MAX_HISTORY)
        return {
          undoStack: stack,
          redoStack: [],
          canUndo: stack.length > 0,
          canRedo: false,
        }
      }),

    undo: () => {
      const state = get()
      if (!state.canUndo || !state.geometry) return null
      const previous = state.undoStack[state.undoStack.length - 1]
      const newStack = state.undoStack.slice(0, -1)
      set({
        geometry: previous,
        undoStack: newStack,
        redoStack: [state.geometry, ...state.redoStack].slice(-MAX_HISTORY),
        canUndo: newStack.length > 0,
        canRedo: true,
        dirty: true,
      })
      return previous
    },

    redo: () => {
      const state = get()
      if (!state.canRedo || !state.geometry) return null
      const next = state.redoStack[0]
      const newRedo = state.redoStack.slice(1)
      set({
        geometry: next,
        undoStack: [...state.undoStack, state.geometry].slice(-MAX_HISTORY),
        redoStack: newRedo,
        canUndo: true,
        canRedo: newRedo.length > 0,
        dirty: true,
      })
      return next
    },

    clearHistory: () =>
      set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false }),

    getFloor: (floorId) => {
      const g = get().geometry
      return g?.floors.find((f) => f.id === floorId)
    },
    getRoom: (roomId) => {
      const g = get().geometry
      for (const f of g?.floors ?? []) {
        const r = f.rooms.find((r) => r.id === roomId)
        if (r) return r
      }
      return undefined
    },
    getWall: (wallId) => {
      const g = get().geometry
      for (const f of g?.floors ?? []) {
        const w = f.walls.find((w) => w.id === wallId)
        if (w) return w
      }
      return undefined
    },
    getOpening: (openingId) => {
      const g = get().geometry
      for (const f of g?.floors ?? []) {
        const o = f.openings.find((o) => o.id === openingId)
        if (o) return o
      }
      return undefined
    },
    getIssuesForRef: (ref) => {
      if (!ref) return []
      const g = get().geometry
      return (g?.issues ?? []).filter((i) => i.ref === ref)
    },
  })),
)

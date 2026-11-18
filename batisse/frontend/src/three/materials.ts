import * as THREE from 'three'

export const WALL_COLOR = 0xf5f4f0
export const WALL_EDGE_COLOR = 0x1c1c1a
export const FLOOR_COLOR = 0xfbfaf7
export const OPENING_COLOR = 0xe2ecf1
export const SLAB_COLOR = 0xe8e6de

export function wallMaterial() {
  return new THREE.MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: 0.85,
    metalness: 0.05,
  })
}

export function floorMaterial() {
  return new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: 0.9,
    metalness: 0.0,
  })
}

export function openingMaterial() {
  return new THREE.MeshStandardMaterial({
    color: OPENING_COLOR,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0.6,
  })
}

export function slabMaterial() {
  return new THREE.MeshStandardMaterial({
    color: SLAB_COLOR,
    roughness: 0.8,
    metalness: 0.0,
  })
}

export function gridMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xdcd9cf,
    transparent: true,
    opacity: 0.4,
  })
}

export function edgeMaterial() {
  return new THREE.LineBasicMaterial({ color: WALL_EDGE_COLOR, linewidth: 1 })
}

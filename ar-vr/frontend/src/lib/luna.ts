import * as THREE from 'three'
import type { LunaExpression } from './environment'
import type { PlayerState } from './player'

const COLORS: Record<LunaExpression, number> = {
  idle: 0x00ffcc,
  happy: 0xffd166,
  thinking: 0x74b9ff,
  walking: 0x55efc4,
  sleepy: 0x6c5ce7,
}

export function createLuna() {
  const material = new THREE.MeshStandardMaterial({ color: COLORS.idle, emissive: COLORS.idle, emissiveIntensity: 0.4 })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), material)
  mesh.name = 'luna'
  return {
    mesh,
    setExpression(e: LunaExpression) {
      const c = COLORS[e] ?? COLORS.idle
      material.color.setHex(c)
      material.emissive.setHex(c)
    },
    /** Move toward a spot beside/above the player, with a gentle bob. */
    follow(player: PlayerState, dt: number, time: number) {
      const side = new THREE.Vector3(0.9, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw)
      const target = player.position.clone().add(side)
      target.y += 1.7 + Math.sin(time * 2) * 0.08
      mesh.position.lerp(target, 1 - Math.exp(-4 * dt))
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}

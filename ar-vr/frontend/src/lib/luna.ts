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

  // Robot body: chest cylinder
  const chest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 0.8, 16),
    material
  )
  chest.position.y = 0.4

  // Robot head: box shape
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.4, 16, 16, 16),
    material
  )
  head.position.y = 1.0

  // Robot arms: cylinders
  const leftArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.5, 16),
    material
  )
  leftArm.position.set(-0.5, 0.5, 0)
  const rightArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.5, 16),
    material
  )
  rightArm.position.set(0.5, 0.5, 0)

  // Robot legs: cylinders
  const leftLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.15, 0.8, 16),
    material
  )
  leftLeg.position.set(-0.15, -0.4, 0)
  const rightLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.15, 0.8, 16),
    material
  )
  rightLeg.position.set(0.15, -0.4, 0)

  // Robot feet: boxes
  const leftFoot = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.1, 0.2, 16, 16, 16),
    material
  )
  leftFoot.position.set(-0.15, -1.1, 0.1)
  const rightFoot = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.1, 0.2, 16, 16, 16),
    material
  )
  rightFoot.position.set(0.15, -1.1, 0.1)

  // Combine all parts into a robot body
  const mesh = new THREE.Group()
  mesh.name = 'luna'
  mesh.add(chest)
  mesh.add(head)
  mesh.add(leftArm)
  mesh.add(rightArm)
  mesh.add(leftLeg)
  mesh.add(rightLeg)
  mesh.add(leftFoot)
  mesh.add(rightFoot)

  return {
    mesh: mesh,
    setExpression(e: LunaExpression) {
      const c = COLORS[e] ?? COLORS.idle
      material.color.setHex(c)
      material.emissive.setHex(c)
    },
    /** Move toward a spot beside/above the player, with varied animation. */
    follow(player: PlayerState, dt: number, time: number) {
      const side = new THREE.Vector3(0.9, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw)
      const target = player.position.clone().add(side)
      target.y += 1.7 + Math.sin(time * 2) * 0.08 + Math.cos(time * 1.5) * 0.05
      mesh.position.lerp(target, 1 - Math.exp(-4 * dt))

      // Add subtle animation to robot parts
      const t = time * 2
      leftArm.rotation.z = Math.sin(t * 0.7) * 0.3
      rightArm.rotation.z = Math.cos(t * 0.7) * 0.3
      leftLeg.rotation.x = Math.sin(t * 0.5) * 0.2
      rightLeg.rotation.x = Math.cos(t * 0.5) * 0.2
    },
    dispose() {
      mesh.children.forEach((child: any) => {
        if (child.geometry) child.geometry.dispose()
      })
      material.dispose()
    },
  }
}

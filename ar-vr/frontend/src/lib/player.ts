import * as THREE from 'three'

export interface InputState {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  sprint: boolean
  crouch: boolean
}

export interface PlayerOptions {
  canJump: boolean
  canSprint: boolean
  canCrouch: boolean
}

export interface PlayerState {
  /** Feet position. y === 0 is the floor. */
  position: THREE.Vector3
  velocityY: number
  onGround: boolean
  /** Radians around Y. 0 looks down -Z. */
  yaw: number
  /** Radians, clamped to ±(π/2 - ε). */
  pitch: number
  crouching: boolean
  sprinting: boolean
}

export const EYE_HEIGHT = 1.6
export const CROUCH_EYE_HEIGHT = 1.0
export const WALK_SPEED = 4
export const SPRINT_SPEED = 7
export const CROUCH_SPEED = 2
export const JUMP_SPEED = 5
export const GRAVITY = 9.8
export const WORLD_LIMIT = 45
const MAX_PITCH = Math.PI / 2 - 0.05

export const emptyInput = (): InputState => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  crouch: false,
})

export const defaultOptions: PlayerOptions = { canJump: true, canSprint: true, canCrouch: true }

export function createPlayer(spawn = new THREE.Vector3(0, 0, 8)): PlayerState {
  return {
    position: spawn.clone(),
    velocityY: 0,
    onGround: true,
    yaw: 0,
    pitch: 0,
    crouching: false,
    sprinting: false,
  }
}

export const eyeHeight = (p: PlayerState) => (p.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT)

export function applyLook(p: PlayerState, dx: number, dy: number, sensitivity = 0.0022) {
  p.yaw -= dx * sensitivity
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch - dy * sensitivity))
}

const UP = new THREE.Vector3(0, 1, 0)

/** Advance the player by `dt` seconds. Mutates and returns `p`. */
export function stepPlayer(
  p: PlayerState,
  input: InputState,
  dt: number,
  options: PlayerOptions = defaultOptions,
): PlayerState {
  dt = Math.min(Math.max(dt, 0), 0.1) // tolerate tab-switch spikes

  p.crouching = options.canCrouch && input.crouch
  p.sprinting = options.canSprint && input.sprint && !p.crouching
  const speed = p.sprinting ? SPRINT_SPEED : p.crouching ? CROUCH_SPEED : WALK_SPEED

  const move = new THREE.Vector3(
    (input.right ? 1 : 0) - (input.left ? 1 : 0),
    0,
    (input.backward ? 1 : 0) - (input.forward ? 1 : 0),
  )
  if (move.lengthSq() > 0) {
    move.normalize().applyAxisAngle(UP, p.yaw).multiplyScalar(speed * dt)
    p.position.add(move)
  }
  p.position.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, p.position.x))
  p.position.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, p.position.z))

  if (options.canJump && input.jump && p.onGround) {
    p.velocityY = JUMP_SPEED
    p.onGround = false
  }
  p.velocityY -= GRAVITY * dt
  p.position.y += p.velocityY * dt
  if (p.position.y <= 0) {
    p.position.y = 0
    p.velocityY = 0
    p.onGround = true
  }
  return p
}

/** Camera position/target for the given perspective. */
export function cameraPose(p: PlayerState, perspective: 'first' | 'third') {
  const eye = p.position.clone().add(new THREE.Vector3(0, eyeHeight(p), 0))
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'))
  if (perspective === 'first') {
    return { position: eye, target: eye.clone().add(forward) }
  }
  const position = eye.clone().addScaledVector(forward, -4).add(new THREE.Vector3(0, 0.6, 0))
  position.y = Math.max(position.y, 0.3)
  return { position, target: eye }
}

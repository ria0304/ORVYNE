import * as THREE from 'three'
import type { LunaExpression } from './environment'
import type { PlayerState } from './player'

// ── Types ────────────────────────────────────────────────────────────────────

export type LunaCommand =
  | { type: 'follow' }
  | { type: 'stay' }
  | { type: 'come_closer' }
  | { type: 'stop_following' }
  | { type: 'open_wardrobe' }
  | { type: 'go_to_studio' }
  | { type: 'help' }
  | { type: 'status' }

export interface LunaState {
  isFollowing: boolean
  currentExpression: LunaExpression
  voiceVolume: number
  voiceMuted: boolean
  battery: number
  zone: string
  interactionStatus: 'none' | 'providing_help' | 'idle'
  speechActive: boolean
  speechText: string
}

// ── Color palette ────────────────────────────────────────────────────────────

const COLORS: Record<LunaExpression, number> = {
  idle: 0x00ffcc,
  happy: 0xffd166,
  thinking: 0x74b9ff,
  walking: 0x55efc4,
  sleepy: 0x6c5ce7,
}

const BASE_COLOR = 0x4a3d67
const JOINT_COLOR = 0x5d5185
const EYE_COLOR = 0x00ffcc

// ── createLuna ───────────────────────────────────────────────────────────────

export function createLuna() {
  const material = new THREE.MeshStandardMaterial({
    color: BASE_COLOR,
    roughness: 0.8,
    metalness: 0.1,
    emissive: 0x2d1f44,
    emissiveIntensity: 0.3,
  })

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: JOINT_COLOR,
    roughness: 0.4,
    metalness: 0.5,
    emissive: 0x1a1530,
    emissiveIntensity: 0.2,
  })

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: EYE_COLOR,
    emissive: EYE_COLOR,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.9,
  })

  // ── Head with expressive eyes ──
  const headOuter = new THREE.Mesh(new THREE.SphereGeometry(0.20, 24, 24), material)
  headOuter.position.set(0, 1.0, 0)

  // Eye socket (left)
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), eyeMaterial)
  leftEye.position.set(-0.06, 1.1, 0.14)
  const leftEyeReflector = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0f0ff, transparent: true, opacity: 0.4 })
  )
  leftEyeReflector.position.set(-0.06, 1.1, 0.20)

  // Eye socket (right)
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), eyeMaterial)
  rightEye.position.set(0.06, 1.1, 0.14)
  const rightEyeReflector = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0f0ff, transparent: true, opacity: 0.4 })
  )
  rightEyeReflector.position.set(0.06, 1.1, 0.20)

  // Blink animation state
  let eyeBlinkTimer = 0
  const blinkDuration = 0.1
  const blinkInterval = 10 + Math.random() * 8

  function doBlink(dt: number) {
    eyeBlinkTimer += dt
    if (eyeBlinkTimer >= blinkInterval) {
      eyeBlinkTimer = 0
      // Scale eyes down (blink)
      leftEye.scale.setScalar(0.1)
      rightEye.scale.setScalar(0.1)
      setTimeout(() => {
        leftEye.scale.setScalar(1)
        rightEye.scale.setScalar(1)
      }, blinkDuration * 1000)
    }
  }

  // ── Head with CNC-milled joints (color change animates) ──
  const headRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 16), jointMaterial)
  headRing.position.set(0, 1.0, 0)

  // ──Chest ──
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.6, 12), material)
  chest.position.set(0, 0.42, 0)

  // Chettpod (detail area)
  const chettpod = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), material)
  chettpod.position.set(0, 0.35, 0.08)

  // ──Arms ──
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 12), jointMaterial)
  leftArm.position.set(-0.35, 0.75, 0)

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 12), jointMaterial)
  rightArm.position.set(0.35, 0.75, 0)

  // ──Legs ──
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 12), jointMaterial)
  leftLeg.position.set(-0.10, 0.15, 0)

  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 12), jointMaterial)
  rightLeg.position.set(0.10, 0.15, 0)

  // Feet (pause points)
  const leftFoot = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    jointMaterial
  )
  leftFoot.position.set(-0.10, 0, 0.02)

  const rightFoot = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    jointMaterial
  )
  rightFoot.position.set(0.10, 0, 0.02)

  // ──Build the robot body group ──
  const mesh = new THREE.Group()
  mesh.name = 'luna'
  mesh.position.y = 0.5 // Small base offset

  mesh.add(headOuter)
  mesh.add(leftEye)
  mesh.add(leftEyeReflector)
  mesh.add(rightEye)
  mesh.add(rightEyeReflector)
  mesh.add(headRing)
  mesh.add(chest)
  mesh.add(chettpod)
  mesh.add(leftArm)
  mesh.add(rightArm)
  mesh.add(leftLeg)
  mesh.add(rightLeg)
  mesh.add(leftFoot)
  mesh.add(rightFoot)

  // ──Animate ──
  let accumulatedTime = 0

  function animate(dt: number) {
    doBlink(dt)
    accumulatedTime += dt
  }

  function updateExpression(e: LunaExpression) {
    const c = COLORS[e] ?? COLORS.idle
    material.color.setHex(c)
    material.emissive.setHex(c)
  }

  function setExpression(e: LunaExpression) {
    updateExpression(e)
  }

  // ──Walk animation ──
  function animateWalking(dt: number, speed: number, time: number) {
    const legSwing = 0.5 + speed * 2
    const armSwing = 0.8 + speed * 1.5

    // Walk phase
    const phase = time * 2
    leftLeg.rotation.x = Math.sin(phase + Math.PI) * legSwing * 0.6
    rightLeg.rotation.x = Math.sin(phase) * legSwing * 0.6

    // Swing arms
    leftArm.rotation.z = Math.sin(phase + Math.PI) * armSwing * 0.4
    rightArm.rotation.z = Math.sin(phase) * armSwing * 0.4

    // Chest bounce
    mesh.position.y = 0.5 + Math.abs(Math.sin(phase * 1.5)) * 0.03

    // Walk straight toward target
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, 0, 0))
    const speedFactor = Math.min(1, speed * 5)
    const newPos = playerPositionTarget.clone()
    mesh.position.lerp(newPos, 1 - Math.exp(-3 * dt))
  }

  // ──Turn animation ──
  function animateTurn(dt: number, currentYaw: number, targetYaw: number, time: number) {
    // Smooth turn
    let angleDiff = targetYaw - currentYaw
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

    const maxSpeed = 0.3
    const targetSpeed = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxSpeed)
    mesh.rotation.y += targetSpeed * dt

    // Gentle arm move during turn
    const turnFactor = 0.5 + 0.5 * Math.abs(targetSpeed / maxSpeed)
    leftArm.rotation.z = Math.cos(time * 3) * 0.15 * turnFactor
    rightArm.rotation.z = -Math.cos(time * 3) * 0.15 * turnFactor
  }

  // ──Idle animation ──
  function animateIdle(dt: number, time: number) {
    // Gentle orbit
    mesh.rotation.y = Math.sin(time * 0.5) * 0.05
    mesh.position.y = 0.5 + Math.sin(time * 0.8) * 0.02

    // Subtle arm wave
    leftArm.rotation.z = Math.sin(time * 0.3) * 0.1
    rightArm.rotation.z = Math.cos(time * 0.3) * 0.1

    // Subtle breathing
    chest.scale.x = 0.98 + Math.sin(time * 0.6) * 0.02
    chest.scale.y = 0.98 + Math.sin(time * 0.6 + Math.PI * 0.5) * 0.02

    // Legs in neutral
    leftLeg.rotation.x = Math.sin(time * 0.2) * 0.02
    rightLeg.rotation.x = Math.cos(time * 0.2) * 0.02
  }

  // ──Reaction animation ──
  let reactionTimer = -1

  function doReaction() {
    reactionTimer = 0
  }

  function animateReaction(dt: number, time: number) {
    if (reactionTimer >= 0) {
      reactionTimer += dt
      // Bounce up slightly on reaction
      if (reactionTimer < 0.2) {
        mesh.position.y = 0.5 + 0.02 * Math.sin(reactionTimer * 40) * 0.5
      } else if (reactionTimer < 0.3) {
        mesh.position.y = 0.5 + (reactionTimer - 0.2) * 0.5 * 0.4
      } else {
        mesh.position.y = 0.5
        reactionTimer = -1
      }
    }
  }

  // ──Follow ──
  let playerPositionTarget = new THREE.Vector3()
  let playerYawTarget = 0

  function follow(player: PlayerState, dt: number, time: number) {
    // Update player target position
    const side = new THREE.Vector3(0.9, 0, 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw)
    const target = player.position.clone().add(side)
    target.y += 1.7 + Math.sin(time * 2) * 0.08 + Math.cos(time * 1.5) * 0.05
    playerPositionTarget = target

    // Smooth movement
    mesh.position.lerp(target, 1 - Math.exp(-3 * dt))

    // Turn toward player
    const direction = player.position.clone().sub(mesh.position).normalize()
    const angleToPlayer = Math.atan2(-direction.z, direction.x)
    // yaw in PlayerState: positive is clockwise looking from above? check player.ts
    const playerYaw = player.yaw
    // Simple approach: align with player facing direction
    mesh.rotation.y = playerYaw * 0.3 + Math.sin(time * 0.5) * 0.02 // smooth follow yaw

    // Add bob
    mesh.position.y = 0.5 + Math.sin(time * 2) * 0.03

    // Subtle idle animation
    animateIdle(dt, time)

    // Reaction animation
    animateReaction(dt, time)
  }

  // ──Set name/identity ──
  const LUNA_NAME = 'Luna'

  // ──Battery ──
  let batteryLevel = 100
  let batteryDecayRate = 0.0005 // slowly drains when active

  function getBattery() {
    return batteryLevel
  }

  // ──Command parsing ──
  const COMMANDS: Record<string, LunaCommand> = {
    follow: { type: 'follow' },
    stop: { type: 'stay' },
    stay: { type: 'stay' },
    'come closer': { type: 'come_closer' },
    'stay here': { type: 'stay' },
    'stop following': { type: 'stop_following' },
    'open wardrobe': { type: 'open_wardrobe' },
    'open my wardrobe': { type: 'open_wardrobe' },
    'go to jewelry studio': { type: 'go_to_studio' },
    'go to studio': { type: 'go_to_studio' },
    'take me to studio': { type: 'go_to_studio' },
    'what can you do': { type: 'help' },
    'what are you': { type: 'status' },
    'status': { type: 'status' },
    'help': { type: 'help' },
  }

  function parseCommand(text: string): LunaCommand | null {
    const normalized = text.toLowerCase().trim()

    // Exact match first
    if (COMMANDS[normalized]) return COMMANDS[normalized]

    // Fuzzy match: find closest command
    const bestMatch = Object.keys(COMMANDS).find(cmd =>
      normalized.includes(cmd) || cmd.includes(normalized)
    )
    return bestMatch ? COMMANDS[bestMatch] : null
  }

  function generateHelpText(): string {
    return `Hello! I'm Luna, your virtual companion. I can:
    • Follow you around the home
    • Show your wardrobe items from WYA
    • Help you with outfit coordination
    • Go to the jewellery studio with you
    • Show you my status`
  }

  // ──Speech ──
  let speechCancelled = false
  let speechGeneration = 0

  function speak(text: string, volume: number = 0.8) {
    // Cancel previous speech
    cancelSpeech()

    // Check API availability
    if (typeof window === 'undefined' || !(window as any).speechSynthesis) {
      console.log('SpeechSynthesis API not available, using visual text instead')
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = volume
    utterance.rate = 1.1
    utterance.pitch = 0.9

    const currentGen = ++speechGeneration

    utterance.onstart = () => {
      if (currentGen === speechGeneration) {
        onSpeechActive?.(true, text)
        onSpeechText?.(text)
      }
    }
    utterance.onend = () => {
      if (currentGen === speechGeneration) {
        onSpeechActive?.(false)
      }
    }
    utterance.onerror = () => {
      if (currentGen === speechGeneration) {
        onSpeechActive?.(false)
      }
    }

    const synth = (window as any).speechSynthesis as any
    synth.speak(utterance)
  }

  function cancelSpeech() {
    speechGeneration++ // Invalidate any ongoing speech
    if (typeof window !== 'undefined' && (window as any).speechSynthesis) {
      ;(window as any).speechSynthesis.cancel()
    }
    onSpeechActive?.(false)
  }

  // Callbacks (set externally)
  let onSpeechActive: ((active: boolean, text?: string) => void) | null = null
  let onSpeechText: ((text: string) => void) | null = null
  let onMessage: ((message: string) => void) | null = null
  let onCommand: ((cmd: LunaCommand) => void) | null = null

  // ──Persistence ──
  function saveState(): LunaState {
    return {
      isFollowing: true, // Placeholder - actual value managed by parent
      currentExpression: 'idle',
      voiceVolume: 0.8,
      voiceMuted: false,
      battery: batteryLevel,
      zone: 'living_room', // Placeholder
      interactionStatus: 'idle',
      speechActive: false,
      speechText: '',
    }
  }

  function loadState(state: Partial<LunaState>) {
    if (state.battery !== undefined) batteryLevel = state.battery
    if (state.voiceVolume !== undefined) batteryDecayRate = 0.0005 * (state.voiceVolume / 0.8)
  }

  return {
    mesh,
    animate,
    updateExpression,
    setExpression,
    follow,
    animateWalking,
    animateTurn,
    animateIdle,
    doReaction,
    getBattery,
    speak,
    cancelSpeech,
    parseCommand,
    generateHelpText,
    setOnSpeechActive(cb: (active: boolean, text?: string) => void) { onSpeechActive = cb },
    setOnSpeechText(cb: (text: string) => void) { onSpeechText = cb },
    setOnMessage(cb: (msg: string) => void) { onMessage = cb },
    setOnCommand(cb: (cmd: LunaCommand) => void) { onCommand = cb },
    setBattery(value: number) { batteryLevel = Math.max(0, Math.min(100, value)) },
    getBatteryDecayRate() { return batteryDecayRate },
    getSpeechActive() { return speechActiveLocal },
    saveState,
    loadState,
    // Compatibility with existing API
    dispose() {
      mesh.children.forEach((child: any) => {
        if (child.geometry) child.geometry.dispose()
      })
      material.dispose()
      jointMaterial.dispose()
      eyeMaterial.dispose()
    },
  }
}

// Compatibility stub for speechActive tracking
let speechActiveLocal = false

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createEnvironment, hourOf, type LunaExpression, type Weather } from '../lib/environment'
import type { FurnitureItem } from '../lib/furniture'
import { createLuna } from '../lib/luna'
import { PLAYER_RADIUS, resolveCollisions, type WallCollider } from '../lib/collision'
import { applyLook, cameraPose, stepPlayer, type InputState, type PlayerOptions, type PlayerState } from '../lib/player'
import { disposeObject } from '../lib/scene'

export const VIEWER_HEIGHT = 480

export interface ThreeViewerProps {
  model: THREE.Object3D | null
  /** Optional VELARIS glTF (URL or data URI) shown on a pedestal in the scene. */
  meshUrl?: string
  furniture: FurnitureItem[]
  selectedFurnitureId: string | null
  mode: 'orbit' | 'walk'
  perspective: 'first' | 'third'
  playerRef: MutableRefObject<PlayerState>
  inputRef: MutableRefObject<InputState>
  options: PlayerOptions
  /** Solid wall pieces the player cannot walk through. */
  colliders?: WallCollider[]
  weather: Weather
  lunaExpression: LunaExpression
  lunaFollowing: boolean
  /** Current battery level (0-100). */
  lunaBattery?: number
  /** Current Luna state for HUD. */
  lunaState?: {
    isFollowing: boolean
    speechActive: boolean
    speechText: string
    interactionStatus: string
  }
  /** Fires whenever the in-world hour changes. */
  onHourChange?: (hour: number) => void
  /** A wardrobe item (userData.wardrobeItemId) was clicked, or pointed at in VR; null = clicked elsewhere. */
  onPickWardrobe?: (itemId: string | null) => void
}

const DAY_LENGTH_SECONDS = 120

function frameModel(camera: THREE.PerspectiveCamera, model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
  const size = box.isEmpty() ? new THREE.Vector3(4, 4, 4) : box.getSize(new THREE.Vector3())
  const dist = Math.max(size.x, size.z, 4) * 0.95 + size.y
  camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist)
  camera.lookAt(center)
  return center
}

export function ThreeViewer(props: ThreeViewerProps) {
  const { model, meshUrl, furniture, selectedFurnitureId } = props
  const [vrSupported, setVrSupported] = useState(false)
  const [inVR, setInVR] = useState(false)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  // WebXR: offer VR only where a headset session is really available.
  useEffect(() => {
    const xr = (navigator as any).xr
    if (!xr?.isSessionSupported) return
    let alive = true
    xr.isSessionSupported('immersive-vr').then((ok: boolean) => alive && setVrSupported(!!ok)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const enterVR = async () => {
    const renderer = rendererRef.current
    const xr = (navigator as any).xr
    if (!renderer || !xr) return
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] })
    await renderer.xr.setSession(session)
  }
  const mountRef = useRef<HTMLDivElement>(null)
  const live = useRef(props)
  const furnitureGroup = useRef<THREE.Group | null>(null)
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    live.current = props
  })

  // Scene lifecycle: rebuilt only when the model or jewellery mesh changes.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !model) return
    let width = mount.clientWidth || 600

    const scene = new THREE.Scene()
    const background = new THREE.Color(0x0a0e17)
    scene.background = background

    const env = createEnvironment()
    scene.add(env.group)
    scene.add(model)

    const group = new THREE.Group()
    furnitureGroup.current = group
    scene.add(group)

    const luna = createLuna()
    scene.add(luna.mesh)
    const lunaRef = { current: luna }
    ;(window as any).__lunaRef = lunaRef

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.0, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x6c5ce7 }),
    )
    body.visible = false
    scene.add(body)

    // Track player position for walking animation
    let prevPlayerPos = new THREE.Vector3(live.current.playerRef.current.position.x, live.current.playerRef.current.position.y, live.current.playerRef.current.position.z)
    let walkTimer = 0

    const camera = new THREE.PerspectiveCamera(60, width / VIEWER_HEIGHT, 0.1, 1000)
    const center = frameModel(camera, model)
    const orbitPose = { position: camera.position.clone(), target: center.clone() }

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, VIEWER_HEIGHT)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    const canvas = renderer.domElement
    rendererRef.current = renderer

    // ── WebXR: the camera rides on a rig we move; controllers point and pick ──
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local-floor')
    const rig = new THREE.Group()
    scene.add(rig)
    const raycaster = new THREE.Raycaster()
    const pickWardrobe = (rc: THREE.Raycaster) => {
      const hit = rc.intersectObject(model, true).find(h => {
        for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.userData?.wardrobeItemId) return true
        return false
      })
      let id: string | null = null
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
        if (o.userData?.wardrobeItemId) {
          id = String(o.userData.wardrobeItemId)
          break
        }
      }
      live.current.onPickWardrobe?.(id)
    }
    const controllers = [0, 1].map(i => {
      const c = renderer.xr.getController(i)
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x60a5fa }),
      )
      ray.scale.z = 3
      c.add(ray)
      c.addEventListener('selectstart', () => {
        const m = new THREE.Matrix4().extractRotation(c.matrixWorld)
        raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld)
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m)
        pickWardrobe(raycaster)
      })
      rig.add(c)
      return c
    })
    const onXrStart = () => {
      const p = live.current.playerRef.current
      scene.remove(camera)
      rig.add(camera)
      camera.position.set(0, 0, 0)
      camera.rotation.set(0, 0, 0)
      rig.position.set(p.position.x, p.position.y, p.position.z)
      rig.rotation.set(0, p.yaw, 0)
      setInVR(true)
    }
    const onXrEnd = () => {
      rig.remove(camera)
      scene.add(camera)
      camera.position.copy(orbitPose.position)
      camera.lookAt(orbitPose.target)
      setInVR(false)
    }
    renderer.xr.addEventListener('sessionstart', onXrStart)
    renderer.xr.addEventListener('sessionend', onXrEnd)
    let snapReady = true
    const xrLocomotion = (dt: number) => {
      const session = renderer.xr.getSession()
      if (!session) return
      const p = live.current.playerRef.current
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() < 1e-6) return
      forward.normalize()
      const right = new THREE.Vector3(-forward.z, 0, forward.x)
      for (const src of session.inputSources) {
        const axes = src.gamepad?.axes
        if (!axes) continue
        const x = axes[2] ?? axes[0] ?? 0, y = axes[3] ?? axes[1] ?? 0
        if (src.handedness === 'left' && (Math.abs(x) > 0.15 || Math.abs(y) > 0.15)) {
          const speed = 1.6
          const next = rig.position.clone()
          next.addScaledVector(forward, -y * speed * dt).addScaledVector(right, x * speed * dt)
          resolveCollisions(next, live.current.colliders ?? [], PLAYER_RADIUS)
          rig.position.set(next.x, rig.position.y, next.z)
        } else if (src.handedness === 'right') {
          if (Math.abs(x) > 0.7 && snapReady) {
            rig.rotation.y -= Math.sign(x) * (Math.PI / 6) // snap turn
            snapReady = false
          } else if (Math.abs(x) < 0.3) snapReady = true
        }
      }
      p.position.set(rig.position.x, p.position.y, rig.position.z) // so the saved position follows the user
      p.yaw = rig.rotation.y
    }

    const controls = new OrbitControls(camera, canvas)
    controls.target.copy(center)
    controls.update()

    // VELARIS jewellery mesh
    let cancelled = false
    let jewellery: THREE.Object3D | null = null
    if (meshUrl) {
      new GLTFLoader().load(
        meshUrl,
        gltf => {
          if (cancelled) return disposeObject(gltf.scene)
          jewellery = gltf.scene
          const box = new THREE.Box3().setFromObject(jewellery)
          const size = box.getSize(new THREE.Vector3())
          const max = Math.max(size.x, size.y, size.z)
          if (max > 0) jewellery.scale.multiplyScalar(0.8 / max)
          jewellery.position.set(0, 1.4, 0)
          scene.add(jewellery)
        },
        undefined,
        error => console.error('Failed to load VELARIS mesh:', error),
      )
    }

    const onResize = () => {
      width = mount.clientWidth || width
      renderer.setSize(width, VIEWER_HEIGHT)
      camera.aspect = width / VIEWER_HEIGHT
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(mount)

    const onClickPick = (e: MouseEvent) => {
      if (!live.current.onPickWardrobe || renderer.xr.isPresenting) return
      const rect = canvas.getBoundingClientRect()
      const ndc = document.pointerLockElement === canvas
        ? new THREE.Vector2(0, 0)
        : new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      pickWardrobe(raycaster)
    }
    canvas.addEventListener('click', onClickPick)
    const onClick = () => {
      if (live.current.mode === 'walk' && document.pointerLockElement !== canvas) {
        try {
          void (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {})
        } catch {
          /* pointer lock unavailable */
        }
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (live.current.mode === 'walk' && document.pointerLockElement === canvas) {
        applyLook(live.current.playerRef.current, e.movementX, e.movementY)
      }
    }
    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)

    const clock = new THREE.Clock()
    let elapsed = 0
    let lastHour = -1
    let lastMode: 'orbit' | 'walk' = live.current.mode
    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.1)
      elapsed += dt
      const p = live.current

      const timeOfDay = (0.35 + elapsed / DAY_LENGTH_SECONDS) % 1
      env.update(timeOfDay, p.weather, dt, background)
      const hour = Math.floor(hourOf(timeOfDay))
      if (hour !== lastHour) {
        lastHour = hour
        p.onHourChange?.(hour)
      }

      if (p.mode !== lastMode) {
        if (p.mode === 'walk') {
          orbitPose.position.copy(camera.position)
          orbitPose.target.copy(controls.target)
        } else {
          camera.position.copy(orbitPose.position)
          controls.target.copy(orbitPose.target)
          if (document.pointerLockElement === canvas) document.exitPointerLock()
        }
        lastMode = p.mode
      }
      controls.enabled = p.mode === 'orbit'

      const player = p.playerRef.current
      if (renderer.xr.isPresenting) {
        xrLocomotion(dt)
        luna.animateIdle(dt, elapsed)
      } else if (p.mode === 'walk') {
        stepPlayer(player, p.inputRef.current, dt, p.options, p.colliders)
        const pose = cameraPose(player, p.perspective)
        camera.position.copy(pose.position)
        camera.lookAt(pose.target)

        // Detect walking - check if player input indicates movement
        const input = p.inputRef.current
        const speed = (input.forward || input.backward) ? 0.8 : (input.left || input.right) ? 0.4 : 0
        const isWalking = speed > 0

        // Walking animation
        if (isWalking) {
          walkTimer += dt * 4 // cycle faster for walking
          luna.animateWalking(dt, speed * 0.3, walkTimer)
        } else {
          // Idle/standing
          luna.animateIdle(dt, elapsed)
        }

        // Turn animation if player facing different direction
        const playerYaw = player.yaw
        const lunaYaw = luna.mesh.rotation.y
        if (Math.abs(playerYaw - lunaYaw) > 0.02) {
          luna.animateTurn(dt, lunaYaw, playerYaw, elapsed)
        }

        prevPlayerPos.copy(player.position)
      } else {
        controls.update()
        luna.animateIdle(dt, elapsed)
      }

      body.visible = p.mode === 'walk' && p.perspective === 'third'
      body.position.set(player.position.x, player.position.y + (player.crouching ? 0.6 : 0.9), player.position.z)
      body.rotation.y = player.yaw

      luna.setExpression(p.lunaExpression)
      if (p.lunaFollowing) luna.follow(player, dt, elapsed)

      // Battery simulation - drains slowly when active
      if (luna.getBatteryDecayRate() > 0) {
        luna.setBattery(luna.getBattery() - luna.getBatteryDecayRate() * dt)
      }

      renderer.render(scene, camera)
    }
    renderer.setAnimationLoop(animate)
    setEpoch(e => e + 1)

    return () => {
      cancelled = true
      renderer.setAnimationLoop(null)
      renderer.xr.getSession()?.end().catch(() => undefined)
      renderer.xr.removeEventListener('sessionstart', onXrStart)
      renderer.xr.removeEventListener('sessionend', onXrEnd)
      canvas.removeEventListener('click', onClickPick)
      controllers.forEach(c => rig.remove(c))
      scene.remove(rig)
      rendererRef.current = null
      resizeObserver.disconnect()
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      controls.dispose()
      furnitureGroup.current = null
      scene.remove(model) // the model is owned by the caller; don't dispose it
      if (jewellery) disposeObject(jewellery)
      env.dispose()
      luna.dispose()
      body.geometry.dispose()
      ;(body.material as THREE.Material).dispose()
      renderer.dispose()
      if (canvas.parentNode === mount) mount.removeChild(canvas)
    }
  }, [model, meshUrl])

  // Furniture meshes (owned by the page) are mirrored into the scene.
  useEffect(() => {
    const group = furnitureGroup.current
    if (!group) return
    furniture.forEach(f => group.add(f.mesh))
    return () => {
      furniture.forEach(f => group.remove(f.mesh))
    }
  }, [furniture, epoch])

  // Highlight the furniture selected for rotation.
  useEffect(() => {
    for (const f of furniture) {
      const m = f.mesh.material as THREE.MeshStandardMaterial
      m.emissive.setHex(f.id === selectedFurnitureId ? 0x3b82f6 : 0x000000)
      m.emissiveIntensity = f.id === selectedFurnitureId ? 0.6 : 0
    }
  }, [furniture, selectedFurnitureId])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: VIEWER_HEIGHT, borderRadius: 8, overflow: 'hidden' }} />
      {vrSupported && !inVR && (
        <button
          onClick={() => void enterVR().catch(() => undefined)}
          aria-label="Enter VR"
          style={{ position: 'absolute', right: 12, bottom: 12, padding: '0.6rem 1.1rem', borderRadius: 8, border: '1px solid #a78bfa', background: 'rgba(76,29,149,0.85)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          Enter VR
        </button>
      )}
    </div>
  )
}

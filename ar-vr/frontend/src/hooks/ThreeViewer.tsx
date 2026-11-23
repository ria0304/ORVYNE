import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createEnvironment, hourOf, type LunaExpression, type Weather } from '../lib/environment'
import type { FurnitureItem } from '../lib/furniture'
import { createLuna } from '../lib/luna'
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
  weather: Weather
  lunaExpression: LunaExpression
  lunaFollowing: boolean
  /** Fires whenever the in-world hour changes. */
  onHourChange?: (hour: number) => void
}

const DAY_LENGTH_SECONDS = 120

function frameModel(camera: THREE.PerspectiveCamera, model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
  const size = box.isEmpty() ? new THREE.Vector3(4, 4, 4) : box.getSize(new THREE.Vector3())
  const dist = Math.max(size.x, size.y, size.z, 4) * 1.4
  camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist)
  camera.lookAt(center)
  return center
}

export function ThreeViewer(props: ThreeViewerProps) {
  const { model, meshUrl, furniture, selectedFurnitureId } = props
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

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.0, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x6c5ce7 }),
    )
    body.visible = false
    scene.add(body)

    const camera = new THREE.PerspectiveCamera(60, width / VIEWER_HEIGHT, 0.1, 1000)
    const center = frameModel(camera, model)
    const orbitPose = { position: camera.position.clone(), target: center.clone() }

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, VIEWER_HEIGHT)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    const canvas = renderer.domElement

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
    let raf = 0

    const animate = () => {
      raf = requestAnimationFrame(animate)
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
      if (p.mode === 'walk') {
        stepPlayer(player, p.inputRef.current, dt, p.options)
        const pose = cameraPose(player, p.perspective)
        camera.position.copy(pose.position)
        camera.lookAt(pose.target)
      } else {
        controls.update()
      }

      body.visible = p.mode === 'walk' && p.perspective === 'third'
      body.position.set(player.position.x, player.position.y + (player.crouching ? 0.6 : 0.9), player.position.z)
      body.rotation.y = player.yaw

      luna.setExpression(p.lunaExpression)
      if (p.lunaFollowing) luna.follow(player, dt, elapsed)

      renderer.render(scene, camera)
    }
    animate()
    setEpoch(e => e + 1)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
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

  return <div ref={mountRef} style={{ width: '100%', height: VIEWER_HEIGHT, borderRadius: 8, overflow: 'hidden' }} />
}

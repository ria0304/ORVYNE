import * as THREE from 'three'

export type Weather = 'clear' | 'cloudy' | 'rain'

const NIGHT = new THREE.Color(0x050814)
const DAY = new THREE.Color(0x87ceeb)
const OVERCAST = new THREE.Color(0x6b7280)
const RAIN_COUNT = 600
const RAIN_AREA = 80
const RAIN_HEIGHT = 40

export interface Environment {
  group: THREE.Group
  /** timeOfDay: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  update(timeOfDay: number, weather: Weather, dt: number, background: THREE.Color): void
  dispose(): void
}

export function createEnvironment(): Environment {
  const group = new THREE.Group()
  group.name = 'exterior-environment'

  const ambient = new THREE.AmbientLight(0xffffff, 0.4)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0)
  group.add(ambient, sun, moonLight)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x1f2937 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02 // below the home floor to avoid z-fighting
  group.add(ground)

  const moon = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }))
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf0f0f0, opacity: 0.25, transparent: true }),
  )
  moon.add(moonGlow)
  group.add(moon)

  const rainPositions = new Float32Array(RAIN_COUNT * 3)
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * RAIN_AREA
    rainPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA
  }
  const rainGeometry = new THREE.BufferGeometry()
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3))
  const rain = new THREE.Points(
    rainGeometry,
    new THREE.PointsMaterial({ color: 0x88c0d0, size: 0.15, transparent: true, opacity: 0.8 }),
  )
  rain.visible = false
  group.add(rain)

  return {
    group,
    update(t, weather, dt, background) {
      const angle = (t - 0.25) * Math.PI * 2
      const elevation = Math.sin(angle)
      const daylight = Math.min(1, Math.max(0, elevation * 1.5))
      const dimmer = weather === 'clear' ? 1 : weather === 'cloudy' ? 0.6 : 0.4

      sun.position.set(Math.cos(angle) * 60, Math.max(elevation, 0.05) * 60, 20)
      sun.intensity = daylight * 1.1 * dimmer
      sun.color.set(elevation < 0.3 ? 0xffc27a : 0xffffff) // golden hour
      moonLight.position.set(-Math.cos(angle) * 60, Math.max(-elevation, 0.05) * 60, -20)
      moonLight.intensity = (1 - daylight) * 0.4
      ambient.intensity = 0.25 + 0.45 * daylight * dimmer
      moon.position.copy(moonLight.position).multiplyScalar(1.5)
      moon.visible = elevation < 0.1

      background.copy(NIGHT).lerp(weather === 'clear' ? DAY : OVERCAST, daylight)

      rain.visible = weather === 'rain'
      if (rain.visible) {
        const attr = rainGeometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < RAIN_COUNT; i++) {
          let y = attr.getY(i) - 25 * dt
          if (y < 0) y += RAIN_HEIGHT
          attr.setY(i, y)
        }
        attr.needsUpdate = true
      }
    },
    dispose() {
      group.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const material = m.material as THREE.Material | undefined
        material?.dispose()
      })
    },
  }
}

export const hourOf = (timeOfDay: number) => timeOfDay * 24

export type LunaExpression = 'idle' | 'happy' | 'thinking' | 'walking' | 'sleepy'
export const LUNA_EXPRESSIONS: LunaExpression[] = ['idle', 'happy', 'thinking', 'walking', 'sleepy']

/** Luna's mood for the hour of the day. */
export function expressionForHour(hour: number): LunaExpression {
  if (hour >= 21 || hour < 6) return 'sleepy'
  if (hour < 12) return 'happy'
  if (hour < 18) return 'thinking'
  return 'idle'
}

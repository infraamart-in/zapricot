import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Card, useCardMaterials, useReflectionMaterials, type CardMaterials } from './Card'
import { CARD_3D } from '../cardSpec'
import type { FinishId } from '../config'
import { loaderHolding, useLoaderHolding } from '../loader/loader'

const ORDER: FinishId[] = ['gold', 'graphite', 'copper', 'titanium', 'midnight']
const PITCH = THREE.MathUtils.degToRad(9) // camera looks down ~9°
const DIST = 11 // camera → ring centre
const TURN_SECONDS = 45
const SHOT = new URLSearchParams(window.location.search).has('shot')
const { width: CARD_W, height: CARD_H } = CARD_3D

type Layout = { count: number; radius: number; scale: number; ringY: number; fogNear: number; fogFar: number }

function setupCamera(cam: THREE.PerspectiveCamera, w: number, h: number) {
  cam.fov = w <= 768 ? 34 : 24
  cam.aspect = w / h
  cam.position.set(0, Math.sin(PITCH) * DIST, Math.cos(PITCH) * DIST)
  cam.lookAt(0, 0, 0)
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}

/**
 * Everything is derived from the viewport so the ring always reaches the screen edges:
 * radius from the visible width at the ring's depth, card size from the visible height
 * at the front card's depth (capped so neighbours never collide), and the ring's height
 * solved so the front card's centre lands at a fixed fraction of the screen.
 */
function computeLayout(cam: THREE.PerspectiveCamera, w: number, h: number): Layout {
  const mobile = w <= 768
  const halfTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
  const visW = 2 * DIST * halfTan * (w / h)
  const radius = visW * (mobile ? 0.56 : 0.445)
  const visHFront = 2 * (DIST - radius) * halfTan
  const byHeight = (visHFront * (mobile ? 0.3 : 0.385)) / CARD_W // portrait: CARD_W is the height
  // wider screens -> bigger ring -> more cards, so spacing stays even (12 at laptop/desktop)
  const count = mobile ? 8 : Math.min(18, Math.max(12, Math.round((2 * Math.PI * radius) / (byHeight * CARD_H * 2.1))))
  const byGap = (0.74 * 2 * Math.PI * radius) / count / CARD_H
  const scale = Math.min(byHeight, byGap)

  const target = mobile ? 0.7 : 0.745 // front-card centre, as a fraction of screen height from the top
  const v = new THREE.Vector3()
  let lo = -8
  let hi = 4
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    v.set(0, mid, radius).project(cam)
    if ((1 - v.y) / 2 > target) lo = mid
    else hi = mid
  }
  return { count, radius, scale, ringY: (lo + hi) / 2, fogNear: DIST - radius * 0.35, fogFar: DIST + radius * 1.25 }
}

/**
 * Studio lighting baked ONCE into an env map (frames={1}); the warm sweep across the brushed metal
 * comes from rotating that environment, which is free per frame (no cube re-render).
 */
function Studio({ still }: { still: boolean }) {
  const scene = useThree((s) => s.scene)
  useFrame(({ clock }) => {
    scene.environmentRotation.y = Math.sin(clock.elapsedTime * (still ? 0.06 : 0.3)) * 1.1
  })
  return (
    <Environment frames={1} resolution={256}>
      <color attach="background" args={['#050505']} />
      <Lightformer form="rect" intensity={1.6} color="#f3e6cf" position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={0.9} color="#cfd6e0" position={[-7, 1, 2]} rotation-y={Math.PI / 2} scale={[8, 1.2, 1]} />
      <Lightformer form="rect" intensity={1.1} color="#e8c995" position={[7, 0.5, 1]} rotation-y={-Math.PI / 2} scale={[8, 1.2, 1]} />
      <Lightformer form="rect" intensity={4} color="#ffe2b0" position={[0, 0.5, 6]} scale={[1.4, 10, 1]} />
    </Environment>
  )
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grd.addColorStop(0, 'rgba(232,186,118,0.5)')
  grd.addColorStop(0.4, 'rgba(200,150,90,0.16)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Ring({ reduced, onReady }: { reduced: boolean; onReady: () => void }) {
  const { camera, size, scene } = useThree()
  const layout = useMemo(() => {
    const cam = camera as THREE.PerspectiveCamera
    setupCamera(cam, size.width, size.height)
    return computeLayout(cam, size.width, size.height)
  }, [camera, size.width, size.height])

  const floorUniform = useMemo(() => ({ value: 0 }), [])
  const materials = useCardMaterials()
  const reflections = useReflectionMaterials(floorUniform)
  const glow = useMemo(glowTexture, [])
  useEffect(() => () => glow.dispose(), [glow])

  const stage = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const mirrorSpin = useRef<THREE.Group>(null)
  // `?shot` skips the intro so static captures show the settled ring
  const st = useRef({ px: 0, py: 0, intro: SHOT ? 1 : 0, angle: SHOT ? 0.18 : 0 })

  const halfH = (CARD_W * layout.scale) / 2
  const lift = halfH + 0.03 // ring centre above the floor
  const floorY = layout.ringY - lift

  useEffect(() => {
    scene.fog = new THREE.Fog('#0b0b0c', layout.fogNear, layout.fogFar)
  }, [scene, layout.fogNear, layout.fogFar])

  // draw the warm-up frames (environment bake, shader compile, texture upload) even while the
  // canvas renders on demand behind the preloader
  const invalidate = useThree((st) => st.invalidate)
  useEffect(() => {
    invalidate()
    const raf = requestAnimationFrame(() => invalidate())
    onReady()
    return () => cancelAnimationFrame(raf)
  }, [onReady, invalidate])

  // Tell the DOM where the front card's top edge lands, so the headline can centre above it
  useLayoutEffect(() => {
    const v = new THREE.Vector3(0, layout.ringY + halfH, layout.radius).project(camera)
    document.documentElement.style.setProperty('--ring-top', `${((1 - v.y) / 2) * size.height}px`)
    return () => {
      document.documentElement.style.removeProperty('--ring-top')
    }
  }, [camera, layout, halfH, size.height])

  const slots = useMemo(
    () => Array.from({ length: layout.count }, (_, i) => ({ a: (i / layout.count) * Math.PI * 2, finish: ORDER[i % ORDER.length] })),
    [layout.count],
  )

  // Per-slot material copies so each card can dim on its own as it turns edge-on
  const slotMats = useMemo(
    () =>
      slots.map((s) => {
        const face = materials[s.finish].face.clone() as THREE.MeshPhysicalMaterial
        const body = materials[s.finish].body.clone() as THREE.MeshStandardMaterial
        const rSrc = reflections[s.finish]
        const rFace = rSrc.face.clone() as THREE.MeshBasicMaterial
        const rBody = rSrc.body.clone() as THREE.MeshBasicMaterial
        rFace.onBeforeCompile = rSrc.face.onBeforeCompile
        rBody.onBeforeCompile = rSrc.body.onBeforeCompile
        return {
          main: { [s.finish]: { face, body } } as unknown as CardMaterials,
          mirror: { [s.finish]: { face: rFace, body: rBody } } as unknown as CardMaterials,
          face,
          body,
          rFace,
          rBody,
          edge: body.color.clone(),
          rEdge: rBody.color.clone(),
          emissive: face.emissiveIntensity,
          env: face.envMapIntensity,
        }
      }),
    [slots, materials, reflections],
  )
  useEffect(
    () => () =>
      slotMats.forEach((m) => {
        m.face.dispose()
        m.body.dispose()
        m.rFace.dispose()
        m.rBody.dispose()
      }),
    [slotMats],
  )

  useFrame((three, dt) => {
    // behind the preloader the scene renders (shaders, textures warm) but time stands still,
    // so the intro starts the moment the overlay begins to fade
    const d = loaderHolding() ? 0 : Math.min(dt, 1 / 30)
    const s = st.current
    // intro: rise from below + a spin-up that settles into the slow cruise (~1.6s)
    s.intro = Math.min(1, s.intro + d / 1.6)
    const e = 1 - Math.pow(1 - s.intro, 3)
    const cruise = ((Math.PI * 2) / TURN_SECONDS) * (reduced ? 0.08 : 1)
    s.angle += d * (cruise + (reduced ? 0 : 2.2 * Math.pow(1 - s.intro, 2)))
    if (spin.current) spin.current.rotation.y = s.angle
    if (mirrorSpin.current) mirrorSpin.current.rotation.y = s.angle

    if (!reduced) {
      const k = 1 - Math.exp(-d * 2.4)
      s.px += (three.pointer.x - s.px) * k
      s.py += (three.pointer.y - s.py) * k
    }
    const g = stage.current
    if (g) {
      g.position.y = floorY - (reduced ? 0 : (1 - e) * 2.2)
      g.rotation.x = -s.py * THREE.MathUtils.degToRad(3)
      g.rotation.z = -s.px * THREE.MathUtils.degToRad(2.5)
      g.rotation.y = s.px * THREE.MathUtils.degToRad(4)
      floorUniform.value = g.position.y
    }

    // Dim cards as they turn edge-on: at grazing angles the metal rim catches full light and
    // reads as a hard bright sliver at the screen edges. Facing = card normal · direction to camera.
    const camZ = Math.cos(PITCH) * DIST
    const R = layout.radius
    slots.forEach((slot, i) => {
      const th = slot.a + s.angle + (g ? g.rotation.y : 0)
      const nx = Math.sin(th)
      const nz = Math.cos(th)
      const vx = -R * nx
      const vz = camZ - R * nz
      const facing = (nx * vx + nz * vz) / Math.hypot(vx, vz)
      const t = THREE.MathUtils.clamp((Math.abs(facing) - 0.06) / 0.34, 0, 1)
      const k = t * t * (3 - 2 * t) // smoothstep
      const m = slotMats[i]
      m.face.color.setScalar(k)
      m.face.emissiveIntensity = m.emissive * k
      m.face.envMapIntensity = m.env * k
      m.body.color.copy(m.edge).multiplyScalar(k)
      m.body.envMapIntensity = 1.4 * k
      m.rFace.color.setScalar(k)
      m.rBody.color.copy(m.rEdge).multiplyScalar(k)
    })
  })

  const cards = (mirror: boolean) =>
    slots.map((s, i) => (
      <group key={i} rotation-y={s.a}>
        <Card finish={s.finish} materials={mirror ? slotMats[i].mirror : slotMats[i].main} position={[0, 0, layout.radius]} rotation-z={Math.PI / 2} scale={layout.scale} />
      </group>
    ))

  return (
    <group ref={stage} position-y={floorY}>
      <group position-y={lift}>
        <group ref={spin}>{cards(false)}</group>
      </group>
      {/* mirrored copy under the floor = soft reflection (alpha fades with depth below) */}
      <group position-y={-lift} scale-y={-1}>
        <group ref={mirrorSpin}>{cards(true)}</group>
      </group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} scale={[layout.radius * 2.6, layout.radius * 1.6, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>
    </group>
  )
}

type SceneProps = { reduced: boolean; onReady: () => void; onFail: () => void; active: boolean }

export default function Scene({ reduced, onReady, onFail, active }: SceneProps) {
  // behind the opaque preloader only the warm-up frames are drawn (on demand), not 60 fps
  const holding = useLoaderHolding()
  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 24, near: 0.1, far: 60 }}
      frameloop={!active ? 'never' : holding ? 'demand' : 'always'}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        // a lost GPU context (driver reset, too many tabs) falls back to the static cards
        // (r3f also forces a context loss on purpose when the canvas unmounts, to free the GPU; ignore that one)
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          window.setTimeout(() => {
            if (gl.domElement.isConnected) onFail()
          }, 0)
        })
      }}
    >
      <Suspense fallback={null}>
        <Studio still={reduced} />
        <Ring reduced={reduced} onReady={onReady} />
      </Suspense>
    </Canvas>
  )
}

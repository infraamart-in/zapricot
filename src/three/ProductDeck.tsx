import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Card, useCardMaterials } from './Card'
import { CARD_3D } from '../cardSpec'
import { PRODUCT_FINISHES } from '../config'

const TILT = THREE.MathUtils.degToRad(24) // tilt per step away from the front card
const SHOT = new URLSearchParams(window.location.search).has('shot')

// Spring (Apple-style params): damping ratio < 1 gives the slight overshoot as a card settles.
const ZETA = 0.78
const RESPONSE = 0.55 // seconds
const OMEGA = (2 * Math.PI) / RESPONSE

/** Peek height of the card centre per step away, taken from the stacked-cards reference. */
function peekY(a: number) {
  const pts = [0, 0.353, 0.665, 0.86, 0.98]
  const i = Math.min(Math.floor(a), pts.length - 2)
  const f = Math.min(1, a - i)
  return pts[i] + (pts[i + 1] - pts[i]) * f
}

type Pose = { y: number; z: number; rx: number; s: number; light: number; visible: boolean }

/**
 * Pose of a card from its signed distance `r` to the front slot
 * (r < 0: already seen → stacked above; r > 0: upcoming → below).
 * Peeking cards lean their outer edge toward the viewer, like the reference render.
 * Moving between front and the first top slot, the card lifts and flips up and over the top.
 */
function pose(r: number): Pose {
  const a = Math.abs(r)
  const dir = r < 0 ? 1 : -1
  let y = dir * peekY(a)
  let z = -0.36 * a
  let rx = dir * TILT * Math.min(a, 2.2)
  if (r < 0 && r > -1) {
    const t = -r
    const arc = Math.sin(Math.PI * t)
    y += 0.4 * arc
    z += 0.42 * arc
    rx -= THREE.MathUtils.degToRad(78) * arc
  }
  // the card crossing the back of the wheel (|r| → 2.5) fades out, so wrapping top↔bottom never pops
  const wrapFade = THREE.MathUtils.clamp((2.5 - a) / 0.38, 0, 1)
  const light = (a < 0.5 ? 1 : Math.max(0, 1 - (a - 0.5) * 0.3)) * wrapFade
  return { y, z, rx, s: 1 - 0.035 * Math.min(a, 3), light, visible: wrapFade > 0.01 }
}

/** Signed distance on the wheel, wrapped into [-2.5, 2.5): always two cards above, two below. */
function wrapRel(x: number, n: number) {
  const h = n / 2
  return ((((x + h) % n) + n) % n) - h
}

function Studio({ sweepKey, still }: { sweepKey: number; still: boolean }) {
  const scene = useThree((s) => s.scene)
  const t = useRef(SHOT ? 0.48 : 1)
  useEffect(() => {
    if (!still) t.current = 0
  }, [sweepKey, still])
  // env baked once; the arrival sweep rotates it so the bright strip crosses the front card
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + Math.min(dt, 1 / 30) / 1.25)
    const e = 1 - Math.pow(1 - t.current, 3)
    scene.environmentRotation.y = -1.25 + 2.5 * e
  })
  return (
    <Environment frames={1} resolution={256}>
      <color attach="background" args={['#050505']} />
      <Lightformer form="rect" intensity={1.5} color="#f3e6cf" position={[0, 6, 3]} rotation-x={Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#cfd6e0" position={[-7, 1, 3]} rotation-y={Math.PI / 2} scale={[8, 1.2, 1]} />
      <Lightformer form="rect" intensity={1} color="#e8c995" position={[7, 0.5, 3]} rotation-y={-Math.PI / 2} scale={[8, 1.2, 1]} />
      <Lightformer form="rect" intensity={0.7} color="#ffffff" position={[0, 0, 8]} scale={[16, 6, 1]} />
      {/* the arrival sweep strip */}
      <Lightformer form="rect" intensity={5} color="#fff0d6" position={[0, 0, 6]} rotation-z={-0.35} scale={[1.6, 14, 1]} />
    </Environment>
  )
}

/** Fit the camera so the whole fanned stack fits the deck box, landscape or portrait. */
function Fit() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const halfTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const aspect = size.width / size.height
    const needH = 2.4 // stack height incl. peeks, with breathing room
    const needW = CARD_3D.width / 0.84
    const dist = Math.max(needH / (2 * halfTan), needW / (2 * halfTan * aspect))
    cam.position.set(0, 0, dist)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

type DeckProps = { target: number; reduced: boolean; onPick: (i: number) => void }

function Deck({ target, reduced, onPick }: DeckProps) {
  const materials = useCardMaterials()
  const groups = useRef<(THREE.Group | null)[]>([])
  const tilt = useRef<THREE.Group>(null)
  const [hover, setHover] = useState(-1)
  const sim = useRef({ p: target, v: 0, px: 0, py: 0, intro: SHOT ? 10 : 0 })
  const targetRef = useRef(target)
  targetRef.current = target

  const base = useMemo(
    () =>
      PRODUCT_FINISHES.map((f) => {
        const m = materials[f.id]
        const face = m.face as THREE.MeshPhysicalMaterial
        const body = m.body as THREE.MeshStandardMaterial
        return { face, body, edge: body.color.clone(), emissive: face.emissiveIntensity, env: face.envMapIntensity }
      }),
    [materials],
  )

  useEffect(() => {
    document.body.style.cursor = hover >= 0 ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover])

  useFrame((state, dt) => {
    const d = Math.min(dt, 1 / 30)
    const s = sim.current
    if (reduced) {
      s.p = targetRef.current
      s.v = 0
    } else {
      // semi-implicit spring, sub-stepped for stability; retargeting keeps velocity → interruptible
      const steps = 4
      const h = d / steps
      for (let i = 0; i < steps; i++) {
        s.v += (OMEGA * OMEGA * (targetRef.current - s.p) - 2 * ZETA * OMEGA * s.v) * h
        s.p += s.v * h
      }
      const k = 1 - Math.exp(-d * 2.6)
      s.px += (state.pointer.x - s.px) * k
      s.py += (state.pointer.y - s.py) * k
    }
    s.intro += d

    if (tilt.current) {
      tilt.current.rotation.y = reduced ? 0 : s.px * THREE.MathUtils.degToRad(5)
      tilt.current.rotation.x = reduced ? 0 : -s.py * THREE.MathUtils.degToRad(4)
    }

    PRODUCT_FINISHES.forEach((_, i) => {
      const g = groups.current[i]
      if (!g) return
      const r = wrapRel(i - s.p, PRODUCT_FINISHES.length)
      const P = pose(r)
      // load-in: from a flat stack, fan out one by one (nearest the front first)
      const order = Math.abs(wrapRel(i - targetRef.current, PRODUCT_FINISHES.length))
      const tIn = reduced ? 1 : Math.min(1, Math.max(0, (s.intro - 0.15 - order * 0.16) / 0.7))
      const e = 1 - Math.pow(1 - tIn, 3)
      const flatZ = -0.05 * order
      const lift = hover === i && Math.abs(r) > 0.5 ? (r < 0 ? 0.05 : -0.05) : 0
      g.position.set(0, (P.y + lift) * e, flatZ + (P.z - flatZ) * e)
      g.rotation.set(P.rx * e, 0, 0)
      g.scale.setScalar(1 + (P.s - 1) * e)
      g.visible = P.visible || e < 1
      const light = 1 + (P.light - 1) * e
      const b = base[i]
      b.face.color.setScalar(0.25 + 0.75 * light)
      b.face.emissiveIntensity = b.emissive * light
      b.face.envMapIntensity = b.env * (0.2 + 0.8 * light)
      b.body.color.copy(b.edge).multiplyScalar(0.2 + 0.8 * light)
    })
  })

  return (
    <group ref={tilt}>
      {PRODUCT_FINISHES.map((f, i) => (
        <group
          key={f.id}
          ref={(el) => (groups.current[i] = el)}
          onClick={(e) => {
            e.stopPropagation()
            onPick(i)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(i)
          }}
          onPointerOut={() => setHover((h) => (h === i ? -1 : h))}
        >
          <Card finish={f.id} materials={materials} />
        </group>
      ))}
    </group>
  )
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady])
  return null
}

export default function ProductDeck(props: DeckProps & { onReady: () => void; onFail: () => void; active: boolean }) {
  const { active, onFail } = props
  return (
    <Canvas
      className="deck-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 0.1, far: 40, position: [0, 0, 6] }}
      frameloop={active ? 'always' : 'never'}
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
      <Fit />
      <Suspense fallback={null}>
        <Studio sweepKey={props.target} still={props.reduced} />
        <Deck target={props.target} reduced={props.reduced} onPick={props.onPick} />
        <Ready onReady={props.onReady} />
      </Suspense>
    </Canvas>
  )
}

import { forwardRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { useThree, type ThreeElements } from '@react-three/fiber'
import { FINISHES, type FinishId } from '../config'
import { CARD_3D } from '../cardSpec'

// all dimensions from the ID-1 spec (1 unit = card height); scenes apply one uniform scale
const { width: CARD_W, height: CARD_H, radius: RADIUS, bevel: BEVEL } = CARD_3D
const DEPTH = CARD_3D.thickness - 2 * BEVEL // extrude depth; the bevel adds the rest

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

let cached: { body: THREE.ExtrudeGeometry; face: THREE.ShapeGeometry } | null = null
function getGeometry() {
  if (cached) return cached
  const shape = roundedRect(CARD_W - BEVEL * 2, CARD_H - BEVEL * 2, RADIUS)
  const body = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 4,
    curveSegments: 16,
  })
  body.translate(0, 0, -DEPTH / 2)

  const face = new THREE.ShapeGeometry(roundedRect(CARD_W, CARD_H, RADIUS), 16)
  // Planar UVs: the texture (exactly CARD_ASPECT) spans the face edge to edge with one uniform
  // scale, so the logo and contactless arcs keep their true shape
  const pos = face.attributes.position
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / CARD_W + 0.5
    uv[i * 2 + 1] = pos.getY(i) / CARD_H + 0.5
  }
  face.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  face.translate(0, 0, DEPTH / 2 + BEVEL + 0.0004)
  cached = { body, face }
  return cached
}

export const CARD_URLS = FINISHES.map((f) => `/cards/${f.id}.webp`)

function useDisposeAll(mats: CardMaterials) {
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) {
        m.face.dispose()
        m.body.dispose()
      }
    },
    [mats],
  )
}

export function useCardMaterials() {
  const textures = useTexture(CARD_URLS)
  const maxAniso = useThree((st) => st.gl.capabilities.getMaxAnisotropy())
  const mats = useMemo(() => {
    const out = {} as CardMaterials
    FINISHES.forEach((f, i) => {
      const t = textures[i]
      // sRGB photo; trilinear mipmaps + the GPU's full anisotropy keep the brushed grain and
      // the engraved logo sharp when a card is seen at a steep angle in the ring
      t.colorSpace = THREE.SRGBColorSpace
      t.generateMipmaps = true
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.magFilter = THREE.LinearFilter
      t.anisotropy = Math.min(16, maxAniso)
      t.needsUpdate = true
      out[f.id] = {
        // Photo carries the brushed grain + baked sheen; the physical layer adds a live,
        // moving specular so the metal "catches" the studio light as it turns.
        face: new THREE.MeshPhysicalMaterial({
          map: t,
          // emissive keeps the photographed finish true-to-colour; metal/clearcoat add live specular
          emissiveMap: t,
          emissive: new THREE.Color('#ffffff'),
          emissiveIntensity: 0.42,
          metalness: 0.45,
          roughness: 0.36,
          clearcoat: 0.6,
          clearcoatRoughness: 0.22,
          anisotropy: 0.7,
          envMapIntensity: 1.15,
        }),
        body: new THREE.MeshStandardMaterial({
          color: f.edge,
          metalness: 1,
          roughness: 0.24,
          envMapIntensity: 1.4,
        }),
      }
    })
    return out
  }, [textures, maxAniso])
  useDisposeAll(mats)
  return mats
}

export type CardMaterials = Record<FinishId, { face: THREE.Material; body: THREE.Material }>

/** Cheap unlit copies for the floor reflection; alpha fades with distance below the floor. */
export function useReflectionMaterials(floor: { value: number }) {
  const textures = useTexture(CARD_URLS)
  const mats = useMemo(() => {
    const patch = (m: THREE.Material) => {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uFloor = floor
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vWorldY;\nuniform float uFloor;')
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= 0.16 * (1.0 - smoothstep(0.0, 0.75, uFloor - vWorldY));')
      }
      return m
    }
    const out = {} as CardMaterials
    FINISHES.forEach((f, i) => {
      out[f.id] = {
        face: patch(new THREE.MeshBasicMaterial({ map: textures[i], transparent: true, depthWrite: false })),
        body: patch(new THREE.MeshBasicMaterial({ color: f.edge, transparent: true, depthWrite: false })),
      }
    })
    return out
  }, [textures, floor])
  useDisposeAll(mats)
  return mats
}

type CardProps = ThreeElements['group'] & {
  finish: FinishId
  materials: CardMaterials
}

export const Card = forwardRef<THREE.Group, CardProps>(function Card({ finish, materials, ...props }, ref) {
  const geo = getGeometry()
  const m = materials[finish]
  return (
    <group ref={ref} {...props}>
      <mesh geometry={geo.body} material={m.body} />
      <mesh geometry={geo.face} material={m.face} />
    </group>
  )
})

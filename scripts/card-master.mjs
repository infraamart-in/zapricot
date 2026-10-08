// Builds a clean, exactly-ID-1 card image from a photographed card with a transparent background.
// The photos come at ~1.69–1.74 : 1; they are never stretched or squashed to fix that:
//   1. drop faint stray pixels (alpha < 10), trim tightly to the card, shave the photographed rim
//   2. bleed the card colour under the transparent corners (they get re-masked later)
//   3. find the engraving (logo + contactless arcs) and crop the wider side margin until both
//      side margins match; if the card is still too wide, extend the brushed metal at top and
//      bottom by mirroring the edge rows (the grain is horizontal, so the seam is invisible)
//   4. scale uniformly to the shared texture size, apply an anti-aliased rounded-rect alpha with
//      the spec corner radius (body fully opaque, no halo)
import sharp from 'sharp'
import { CARD_ASPECT, CARD_RADIUS_OF_WIDTH } from '../src/cardSpec.ts'

const RIM = 10 // px of photographed edge/outline to shave off before re-masking

export async function cardMaster(input, size) {
  const src = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const SW = src.info.width
  const SH = src.info.height
  const s = src.data
  for (let i = 3; i < s.length; i += 4) if (s[i] < 10) s[i] = 0

  // 1) tight bounds (alpha ≥ 128), minus the rim
  let bx0 = SW, bx1 = -1, by0 = SH, by1 = -1
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++)
      if (s[(y * SW + x) * 4 + 3] >= 128) {
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
      }
  const ox = bx0 + RIM
  const oy = by0 + RIM
  const W = bx1 - bx0 + 1 - 2 * RIM
  const H = by1 - by0 + 1 - 2 * RIM

  // 2) RGB with the colour bled under transparent / soft-edged pixels
  // "solid" = the photo is opaque here AND not within ERODE px of its own rounded corner, whose
  // bright photographed outline curves inward past the straight-edge shave. Outside the crop
  // counts as solid, so only the corner arcs get eroded (the straight edges are already shaved).
  const ERODE = 12
  const opaque = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) opaque[y * W + x] = s[((oy + y) * SW + (ox + x)) * 4 + 3] >= 250 ? 1 : 0
  const rowMin = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let ok = 1
      for (let k = -ERODE; k <= ERODE && ok; k++) {
        const nx = x + k
        if (nx >= 0 && nx < W && !opaque[y * W + nx]) ok = 0
      }
      rowMin[y * W + x] = ok
    }
  const solid = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let ok = 1
      for (let k = -ERODE; k <= ERODE && ok; k++) {
        const ny = y + k
        if (ny >= 0 && ny < H && !rowMin[ny * W + x]) ok = 0
      }
      solid[y * W + x] = ok
    }

  const rgb = new Uint8Array(W * H * 3)
  const known = new Uint8Array(W * H)
  const todo = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const si = ((oy + y) * SW + (ox + x)) * 4
      if (solid[y * W + x]) {
        rgb.set([s[si], s[si + 1], s[si + 2]], (y * W + x) * 3)
        known[y * W + x] = 1
      } else todo.push(y * W + x)
    }
  let pending = todo
  while (pending.length) {
    const next = []
    const fill = []
    for (const p of pending) {
      const x = p % W
      const y = (p - x) / W
      let r = 0, g = 0, b = 0, c = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !known[ny * W + nx]) continue
          const q = (ny * W + nx) * 3
          r += rgb[q]; g += rgb[q + 1]; b += rgb[q + 2]; c++
        }
      if (c) fill.push([p, r / c, g / c, b / c])
      else next.push(p)
    }
    if (!fill.length) break
    for (const [p, r, g, b] of fill) {
      rgb.set([r, g, b], p * 3)
      known[p] = 1
    }
    pending = next
  }

  // 3) engraving extents: columns with bright, thin detail standing out from their neighbours
  const lum = (x, y) => {
    const q = (y * W + x) * 3
    return 0.3 * rgb[q] + 0.6 * rgb[q + 1] + 0.1 * rgb[q + 2]
  }
  const score = new Float32Array(W)
  for (let y = Math.round(H * 0.3); y < H * 0.95; y++)
    for (let x = 6; x < W - 6; x++) {
      const here = lum(x, y)
      const l = lum(x - 6, y)
      const r = lum(x + 6, y)
      if (here - Math.max(l, r) > 25 || here - Math.min(l, r) > 45) score[x]++
    }
  let first = -1, last = -1
  for (let x = Math.round(W * 0.02); x < W * 0.98; x++)
    if (score[x] > 2) {
      if (first < 0) first = x
      last = x
    }
  const L0 = first
  const R0 = W - 1 - last

  // balance the side margins by cropping the wider one, then fix the aspect
  const m = Math.min(L0, R0)
  let cl = L0 - m
  let cr = R0 - m
  let cw = W - cl - cr
  let dh = cw / CARD_ASPECT - H
  if (dh < 0) {
    // still enough width: crop the rest evenly from both sides
    const extra = cw - H * CARD_ASPECT
    cl += extra / 2
    cr += extra / 2
    cw = W - cl - cr
    dh = 0
  }
  cl = Math.round(cl)
  cw = Math.round(cw)
  const dt = Math.round(dh / 2)
  const db = Math.round(dh) - dt
  const FH = H + dt + db

  const out = Buffer.alloc(cw * FH * 3)
  for (let y = 0; y < FH; y++) {
    let sy = y - dt
    if (sy < 0) sy = -sy // mirror about the top row
    if (sy >= H) sy = 2 * (H - 1) - sy // mirror about the bottom row
    out.set(rgb.subarray((sy * W + cl) * 3, (sy * W + cl + cw) * 3), y * cw * 3)
  }

  // 4) uniform scale to the shared size (aspect error < 0.1%), then the rounded-rect alpha
  const body = await sharp(out, { raw: { width: cw, height: FH, channels: 3 } })
    .resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer()
  const SS = 4
  const R = CARD_RADIUS_OF_WIDTH * size.width * SS
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width * SS}" height="${size.height * SS}"><rect width="${size.width * SS}" height="${size.height * SS}" rx="${R}" ry="${R}" fill="#fff"/></svg>`
  const alpha = await sharp(Buffer.from(svg)).resize(size.width, size.height, { kernel: 'lanczos3' }).extractChannel(3).raw().toBuffer()
  const rgba = Buffer.alloc(size.width * size.height * 4)
  for (let i = 0, j = 0, k = 0; k < alpha.length; i += 4, j += 3, k++) {
    rgba[i] = body[j]
    rgba[i + 1] = body[j + 1]
    rgba[i + 2] = body[j + 2]
    rgba[i + 3] = alpha[k]
  }

  return {
    data: rgba,
    width: size.width,
    height: size.height,
    report: {
      photo: `${W}×${H} (${(W / H).toFixed(3)})`,
      margins: `logo ${L0}px · arcs ${R0}px`,
      cropped: `${cl}px left, ${W - cl - cw}px right`,
      extended: `${dt}px top, ${db}px bottom`,
      scale: +(size.width / cw).toFixed(4),
      scaleY: +(size.height / FH).toFixed(4),
    },
  }
}

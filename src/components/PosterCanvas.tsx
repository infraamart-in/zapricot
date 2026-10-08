import { useEffect, useRef } from 'react'

/** Paint the ring still into a canvas (cover-fit, anchored bottom-centre). Safe to call repeatedly. */
export function drawPoster(canvas: HTMLCanvasElement) {
  const img = new Image()
  img.decoding = 'async'
  img.src = window.matchMedia('(max-width: 768px)').matches ? '/img/poster-home-mobile.webp' : '/img/poster-home-desktop.webp'
  const draw = () => {
    if (!img.complete || !img.naturalWidth) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * dpr
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.drawImage(img, (canvas.width - dw) / 2, canvas.height - dh, dw, dh)
  }
  img.onload = draw
  window.addEventListener('resize', draw)
  return () => {
    img.onload = null
    window.removeEventListener('resize', draw)
  }
}

/**
 * Still frame of the card ring shown until the live WebGL scene boots. Drawn into a <canvas>
 * rather than an <img>: canvas content is not a Largest-Contentful-Paint candidate, so the LCP
 * is the real HTML headline, not this backdrop. main.tsx paints it before hydration too.
 */
export function PosterCanvas({ hidden }: { hidden: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // main.tsx paints it before hydration; only draw here when it hasn't been (client-side navigation)
  useEffect(() => (ref.current && !ref.current.width ? drawPoster(ref.current) : undefined), [])
  return <canvas ref={ref} className="scene-poster" data-hidden={hidden} aria-hidden />
}

import { useEffect, useRef } from 'react'
import { createWheelStepper } from './wheelStepper'

/** Input captured by main.tsx before hydration, replayed on mount. */
export type PreGesture =
  | { type: 'wheel'; delta: number; mode: number; t: number }
  | { type: 'touchstart' | 'touchend'; x: number; y: number; t: number }
  | { type: 'key'; key: string; t: number }

/**
 * Turns wheel / trackpad / touch / keyboard into discrete ±1 steps without scrolling the page.
 *
 * Trackpads emit a long inertia tail after a flick. One flick must equal one step, so after
 * a step we stay "latched" until the wheel goes quiet — unless a *new* impulse arrives
 * (a pause, or a clear spike above the decaying tail), which counts as a deliberate
 * second flick and steps again immediately (the spring re-targets, so it stays fluid).
 */
export function useStepInput(onStep: (dir: 1 | -1) => void, opts: { enabled: boolean; onKey?: (e: KeyboardEvent) => boolean }) {
  const cb = useRef(onStep)
  cb.current = onStep
  const keyCb = useRef(opts.onKey)
  keyCb.current = opts.onKey

  useEffect(() => {
    if (!opts.enabled) return
    const blocked = () => !!document.querySelector('dialog[open]')

    const wheel = createWheelStepper((dir) => cb.current(dir))
    const onWheel = (e: WheelEvent) => {
      if (blocked()) return
      e.preventDefault()
      const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      wheel(e.deltaMode === 1 ? raw * 16 : e.deltaMode === 2 ? raw * 400 : raw, e.timeStamp)
    }

    let y0 = 0
    let x0 = 0
    let t0 = 0
    const onTouchStart = (e: TouchEvent) => {
      if (blocked() || e.touches.length !== 1) return
      y0 = e.touches[0].clientY
      x0 = e.touches[0].clientX
      t0 = performance.now()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!blocked()) e.preventDefault() // no pull-to-refresh / rubber-band on the page
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (blocked() || !t0) return
      const t = e.changedTouches[0]
      const dy = y0 - t.clientY
      const dx = x0 - t.clientX
      const dt = performance.now() - t0
      t0 = 0
      // distance OR a quick flick (velocity) commits, mostly-vertical only
      if (Math.abs(dy) > Math.abs(dx) && (Math.abs(dy) > 36 || (Math.abs(dy) > 14 && Math.abs(dy) / dt > 0.45))) {
        cb.current(dy > 0 ? 1 : -1)
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (blocked()) return
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (keyCb.current?.(e)) return
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        cb.current(1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        cb.current(-1)
      }
    }

    // replay anything that happened before hydration, then stop the recorder
    const w = window as Window & { __preGestures?: PreGesture[] | null }
    const pending = w.__preGestures ?? []
    w.__preGestures = null
    let ts: { x: number; y: number; t: number } | null = null
    for (const g of pending) {
      if (g.type === 'wheel') wheel(g.mode === 1 ? g.delta * 16 : g.mode === 2 ? g.delta * 400 : g.delta, g.t)
      else if (g.type === 'touchstart') ts = g
      else if (g.type === 'touchend' && ts) {
        const dy = ts.y - g.y
        const dx = ts.x - g.x
        const dt = g.t - ts.t
        if (Math.abs(dy) > Math.abs(dx) && (Math.abs(dy) > 36 || (Math.abs(dy) > 14 && Math.abs(dy) / dt > 0.45))) cb.current(dy > 0 ? 1 : -1)
        ts = null
      } else if (g.type === 'key') onKey(new KeyboardEvent('keydown', { key: g.key }))
    }
    // a touch that started before hydration and ends after it
    if (ts) {
      y0 = ts.y
      x0 = ts.x
      t0 = performance.now() - 1
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKey)
    }
  }, [opts.enabled])
}

/**
 * Pure wheel → step logic (timestamps in, steps out) so it can be tested without a browser.
 *
 * A trackpad flick is a burst followed by a long, decaying inertia tail. One flick = one step:
 * after stepping we latch until the wheel goes quiet (gap > IDLE). While latched, a *new*
 * impulse — a clear spike above the decaying tail — counts as a deliberate second flick.
 */
const IDLE = 160 // ms of silence that ends a gesture
const MIN_DELTA = 3 // ignore sub-pixel noise
const SPIKE = 1.8 // a new flick: delta jumps this far above the tail
const SPIKE_MIN = 24
const SPIKE_GUARD = 240 // ms after a step before a spike can count (tail start is noisy)
const MAX_LATCH = 1300 // never stay latched longer than this

export function createWheelStepper(onStep: (dir: 1 | -1) => void) {
  let latched = false
  let latchedAt = 0
  let lastT = -Infinity
  let lastAbs = 0

  return (delta: number, t: number) => {
    const abs = Math.abs(delta)
    const gap = t - lastT
    lastT = t
    if (gap > IDLE) latched = false

    if (latched) {
      const spike = t - latchedAt > SPIKE_GUARD && abs > SPIKE_MIN && abs > lastAbs * SPIKE
      const stale = t - latchedAt > MAX_LATCH
      lastAbs = abs
      if (!spike && !stale) return
    }
    lastAbs = abs
    if (abs < MIN_DELTA) return
    latched = true
    latchedAt = t
    onStep(delta > 0 ? 1 : -1)
  }
}

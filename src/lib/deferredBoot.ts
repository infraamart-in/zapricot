import { startTransition, useEffect, useState } from 'react'

// Movement-type input only. Taps/clicks/keys are deliberately NOT boot triggers: booting evaluates
// the large three.js chunk, and doing that between a finger going down and its click would make
// that tap slow (INP). Swipes/scrolls aren't INP interactions, and the idle timer covers the rest.
const EVENTS = ['pointermove', 'touchmove', 'wheel', 'scroll'] as const
const IDLE_MS = 8000

let booted = false
const listeners = new Set<() => void>()
function boot() {
  if (booted) return
  booted = true
  EVENTS.forEach((e) => window.removeEventListener(e, boot, true))
  // never do the heavy WebGL start inside the input event: let the browser paint the response
  // to the tap/click first (good INP), then mount the scene as a low-priority transition.
  requestAnimationFrame(() =>
    setTimeout(() =>
      startTransition(() => {
        listeners.forEach((l) => l())
        listeners.clear()
      }),
    ),
  )
}
if (typeof window !== 'undefined') {
  // static captures (`?shot`) render the live scene straight away
  if (new URLSearchParams(window.location.search).has('shot')) booted = true
  else {
    EVENTS.forEach((e) => window.addEventListener(e, boot, { capture: true, passive: true }))
    window.addEventListener('load', () => window.setTimeout(boot, IDLE_MS), { once: true })
  }
}

/**
 * Heavy WebGL waits for the visitor: it boots on the first movement (mouse move, swipe, wheel,
 * scroll) or after 8s idle. Until then pages show a static poster, so first paint and
 * input stay fast on phones. Once booted it stays booted for the rest of the session.
 */
export function useDeferredBoot() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (booted && !listeners.size) return setReady(true)
    const on = () => setReady(true)
    listeners.add(on)
    return () => {
      listeners.delete(on)
    }
  }, [])
  return ready
}

/** React 18 doesn't know `fetchPriority`; the lowercase HTML attribute passes through untouched. */
export const HIGH_PRIORITY = { fetchpriority: 'high' } as Record<string, string>

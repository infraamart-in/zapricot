import { useEffect, useState } from 'react'

/**
 * Home-page preloader controller. The overlay itself is static HTML + inline CSS in the
 * prerendered index.html (see loader.css / scripts/prerender.mjs); this only decides when it goes.
 *
 * Hides when BOTH: at least MIN_MS since navigation start, AND the hero is ready (the 3D ring has
 * rendered its first frames with textures loaded, and the fonts are in). SAFETY_MS caps the wait.
 * Removing `data-loading` from <html> is the "go" signal: it un-pauses the headline/navbar
 * entrance and the ring's intro, so they are already moving while the overlay fades.
 */
const MIN_MS = 2500
const SAFETY_MS = 6000
const FADE_MS = 600
export const HERO_READY_EVENT = 'zap:hero-ready'
export const RELEASE_EVENT = 'zap:loader-release'

let heroReady = false
/** Called by the app once the hero can play (or immediately when it falls back to 2D). */
export function signalHeroReady() {
  if (heroReady) return
  heroReady = true
  window.dispatchEvent(new Event(HERO_READY_EVENT))
}

/** True while the overlay still hides the page: animations hold their first frame. */
export function loaderHolding() {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-loading')
}

/** React hook: true while the overlay holds the page; flips to false the moment the fade starts. */
export function useLoaderHolding() {
  const [holding, setHolding] = useState(loaderHolding)
  useEffect(() => {
    if (!loaderHolding()) return setHolding(false)
    const go = () => setHolding(false)
    window.addEventListener(RELEASE_EVENT, go, { once: true })
    return () => window.removeEventListener(RELEASE_EVENT, go)
  }, [])
  return holding
}

export function hasLoader() {
  return typeof document !== 'undefined' && !!document.getElementById('zap-loader')
}

export function startLoader() {
  const el = document.getElementById('zap-loader')
  if (!el) return
  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, Math.max(0, ms - performance.now())))
  const ready = new Promise<void>((r) => {
    if (heroReady) r()
    else window.addEventListener(HERO_READY_EVENT, () => r(), { once: true })
  })
  const fonts = document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve()

  let done = false
  const hide = () => {
    if (done) return
    done = true
    document.documentElement.removeAttribute('data-loading') // go: ring + headline start now
    window.dispatchEvent(new Event(RELEASE_EVENT))
    el.classList.add('is-out')
    window.setTimeout(() => el.remove(), FADE_MS + 50)
  }
  Promise.race([Promise.all([wait(MIN_MS), ready, fonts]), wait(SAFETY_MS)]).then(hide, hide)
}

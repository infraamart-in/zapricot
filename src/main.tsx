import { StrictMode, startTransition } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App'
import { drawPoster } from './components/PosterCanvas'
import type { PreGesture } from './lib/stepInput'
import { hasLoader, startLoader } from './loader/loader'
import { EARLY_ACCESS_URL } from './config'
import './styles.css'
import './about.css'
import './site.css'

// /contact is served the prerendered home page; switch the URL before hydrating so the
// first client render matches that HTML, then App opens the Contact dialog.
const openContact = window.location.pathname.replace(/\/+$/, '') === '/contact'
if (openContact) {
  window.history.replaceState({}, '', '/')
  ;(window as Window & { __openContact?: boolean }).__openContact = true
}

// old early-access deep links (/#early-access) now go straight to the Google Form
if (window.location.hash === '#early-access') window.location.replace(EARLY_ACCESS_URL)

// home-page preloader: start its clock/safety timer before anything else can go wrong
const loader = hasLoader()
if (loader) startLoader()

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

if (!root.firstElementChild) {
  // dev server: empty shell → client render
  createRoot(root).render(app)
} else {
  // the home backdrop is part of first paint, not of interactivity: draw it right away
  const poster = document.querySelector<HTMLCanvasElement>('canvas.scene-poster')
  if (poster) drawPoster(poster)
  /**
   * Production pages are prerendered, complete HTML (links already work as plain links).
   * Hydration starts on the first interaction (pointer/touch/key/scroll/focus), or after 6s of
   * quiet, so React's start-up never competes with first paint. It runs inside startTransition:
   * a tap that arrives mid-hydration jumps the queue (React hydrates that part first and replays
   * the click), keeping the first interaction fast. Pre-hydration wheel/touch/key input is queued
   * and replayed (see stepInput).
   */
  // gestures that arrive before hydration (e.g. the first swipe on /product, which itself triggers
  // hydration) are queued and replayed by useStepInput when it mounts — nothing is lost
  const q: PreGesture[] = []
  ;(window as Window & { __preGestures?: PreGesture[] | null }).__preGestures = q
  const rec = (e: Event) => {
    if ((window as Window & { __preGestures?: PreGesture[] | null }).__preGestures !== q) return
    if (e instanceof WheelEvent) q.push({ type: 'wheel', delta: Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX, mode: e.deltaMode, t: e.timeStamp })
    else if (e instanceof TouchEvent && e.changedTouches[0]) q.push({ type: e.type as 'touchstart' | 'touchend', x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, t: e.timeStamp })
    else if (e instanceof KeyboardEvent) q.push({ type: 'key', key: e.key, t: e.timeStamp })
  }
  for (const t of ['wheel', 'touchstart', 'touchend', 'keydown']) window.addEventListener(t, rec, { capture: true, passive: true })

  const EVENTS = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel', 'scroll', 'focusin'] as const
  let started = false
  const start = () => {
    if (started) return
    started = true
    EVENTS.forEach((e) => window.removeEventListener(e, start, true))
    startTransition(() => {
      hydrateRoot(root, app)
    })
    // pages without a consumer (everything but /product) just drop the queue shortly after
    window.setTimeout(() => {
      const w = window as Window & { __preGestures?: PreGesture[] | null }
      if (w.__preGestures === q) w.__preGestures = null
      for (const t of ['wheel', 'touchstart', 'touchend', 'keydown']) window.removeEventListener(t, rec, true)
    }, 3000)
  }
  // deep links (?finish=…, /contact, any #hash) change what's shown → hydrate straight away;
  // behind the home preloader there is nothing to protect, so get the hero ready right away
  if (loader || openContact || window.location.hash || window.location.search) start()
  else {
    EVENTS.forEach((e) => window.addEventListener(e, start, { capture: true, passive: true }))
    // no interaction yet: hydrate once the page has been quiet for a while
    const idle = () => window.setTimeout(start, 6000)
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
  }
}

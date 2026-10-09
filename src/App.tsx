import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { Hero, RingFallback } from './components/Hero'
import { LegalBar } from './components/SiteFooter'
import { ReportFail, SceneBoundary, usePageVisible } from './components/SceneBoundary'
import { Product } from './pages/Product'
import { About } from './pages/About'
import { Privacy, Terms } from './pages/Legal'
import { NotFound } from './pages/NotFound'
import { usePath } from './lib/router'
import { usePrefs } from './lib/prefs'
import { applyMeta } from './lib/seo'
import { useDeferredBoot } from './lib/deferredBoot'
import { PosterCanvas } from './components/PosterCanvas'
import { signalHeroReady } from './loader/loader'

const Scene = lazy(() => import('./three/Scene'))
// the Contact dialog is not part of the first paint: load on first open (prefetched when idle)
const loadContact = () => import('./components/ContactDialog')
const ContactDialog = lazy(() => loadContact().then((m) => ({ default: m.ContactDialog })))

/** Routes that scroll like documents; everything else is one fixed screen. */
const SCROLLING = new Set(['/about', '/privacy', '/terms'])
const KNOWN = new Set(['/', '/product', '/about', '/privacy', '/terms'])

export default function App() {
  const path = usePath()
  const { reduced, mobile, webgl } = usePrefs()
  const visible = usePageVisible()
  const boot = useDeferredBoot()
  const [sceneReady, setSceneReady] = useState(false)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const closeContact = useCallback(() => setContactOpen(false), [])
  // the dialog stays mounted after its first open (so its close animation and state survive)
  const [contactMounted, setContactMounted] = useState(false)
  useEffect(() => {
    if (contactOpen) setContactMounted(true)
  }, [contactOpen])
  useEffect(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 4000 }) : window.setTimeout(cb, 2500))
    idle(() => {
      loadContact()
    })
  }, [])
  const openContact = useCallback(() => setContactOpen(true), [])
  const onReady = useCallback(() => setSceneReady(true), [])
  const onFail = useCallback(() => setSceneFailed(true), [])
  const isHome = path === '/'
  const notFound = !KNOWN.has(path)
  const show3D = webgl && !sceneFailed

  useEffect(() => {
    applyMeta(path)
    document.documentElement.dataset.scroll = SCROLLING.has(path) ? 'on' : 'off'
    window.scrollTo(0, 0)
  }, [path])

  // deep link that opens the Contact dialog: /contact (rewritten to home, see main.tsx)
  useEffect(() => {
    if ((window as Window & { __openContact?: boolean }).__openContact) setContactOpen(true)
  }, [])

  // tell the home preloader the hero can play: two frames after the live scene is ready (first
  // frames drawn with textures and shaders), or at once when the home page uses the 2D fallback
  useEffect(() => {
    if (!isHome) return
    if (show3D && !sceneReady) return
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(signalHeroReady)
    })
    return () => cancelAnimationFrame(raf)
  }, [isHome, show3D, sceneReady])

  const screen = path === '/product' ? 'screen--product' : SCROLLING.has(path) ? 'screen--about' : isHome ? 'screen--home' : ''

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="grain" aria-hidden />
      {/* separate Suspense boundaries = separately hydrated chunks (React yields between them) */}
      <Suspense fallback={null}>
        <Nav onContact={openContact} contactOpen={contactOpen} />
      </Suspense>

      {isHome && show3D && (
        // static still of the ring (canvas, so the headline stays the LCP); cross-fades out once the live scene is ready
        <PosterCanvas hidden={sceneReady} />
      )}
      {isHome && show3D && boot && (
        <div className="scene" data-ready={sceneReady} aria-hidden>
          <div className="scene__veil" />
          <SceneBoundary fallback={<ReportFail onFail={onFail} />}>
            <Suspense fallback={null}>
              <Scene reduced={reduced} onReady={onReady} onFail={onFail} active={visible} />
            </Suspense>
          </SceneBoundary>
        </div>
      )}

      <main id="main" tabIndex={-1} className={`screen ${screen}`}>
        <Suspense fallback={null}>
        {isHome ? (
          <Hero />
        ) : path === '/about' ? (
          <About onContact={openContact} />
        ) : path === '/product' ? (
          <Product reduced={reduced} mobile={mobile} webgl={webgl} active={visible} />
        ) : path === '/privacy' ? (
          <Privacy onContact={openContact} />
        ) : path === '/terms' ? (
          <Terms onContact={openContact} />
        ) : notFound ? (
          <NotFound />
        ) : null}
        {isHome && !show3D && <RingFallback />}
        </Suspense>
      </main>

      <Suspense fallback={null}>{(isHome || path === '/product' || notFound) && <LegalBar />}</Suspense>

      <Suspense fallback={null}>
        {contactMounted && <ContactDialog open={contactOpen} onClose={closeContact} />}
      </Suspense>
    </div>
  )
}

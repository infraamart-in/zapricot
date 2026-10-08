import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useIsoLayoutEffect } from '../lib/ssr'
import { PRODUCT_FINISHES } from '../config'
import { CARD_IMAGE_2D } from '../cardSpec'
import { useStepInput } from '../lib/stepInput'
import { Link } from '../lib/router'
import { ReportFail, SceneBoundary } from '../components/SceneBoundary'
import { HIGH_PRIORITY, useDeferredBoot } from '../lib/deferredBoot'

const ProductDeck = lazy(() => import('../three/ProductDeck'))
const N = PRODUCT_FINISHES.length
/** True circular index: …, -1 → Titanium, 0 → Gold, 5 → Gold, … */
const mod = (x: number) => ((x % N) + N) % N

/** Deep link (?finish=copper) — read after mount so prerender and hydration agree. */
function linkedIndex() {
  const id = new URLSearchParams(window.location.search).get('finish')
  return PRODUCT_FINISHES.findIndex((f) => f.id === id)
}

type Props = { reduced: boolean; mobile: boolean; webgl: boolean; active: boolean }

export function Product({ reduced, mobile, webgl, active: pageVisible }: Props) {
  const [failed, setFailed] = useState(false)
  const boot = useDeferredBoot()
  const onFail = useCallback(() => setFailed(true), [])
  // `step` is an unbounded wheel position; the finish on show is step mod 5. Every scroll is ±1,
  // so crossing the Titanium → Gold seam is an ordinary step — the wheel can never rewind.
  const [step, setStep] = useState(0)
  const active = mod(step)
  const [touched, setTouched] = useState(false)
  const [ready, setReady] = useState(false)
  const [dip, setDip] = useState(0)
  const [shown, setShown] = useState(0) // wheel position the deck renders (lags in reduced-motion crossfade)
  const blocks = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    const i = linkedIndex()
    if (i > 0) {
      setStep(i)
      setShown(i)
    }
  }, [])
  const first = useRef(true)

  const move = useCallback((delta: number) => {
    if (!delta) return
    setTouched(true)
    setStep((s) => s + delta)
  }, [])

  /** Jump to a finish by the shortest way round the wheel (ticks, clicking a peeking card). */
  const goTo = useCallback(
    (i: number) => {
      let d = mod(i - active)
      if (d > N / 2) d -= N
      move(d)
    },
    [active, move],
  )

  useStepInput((dir) => move(dir), { enabled: true })

  // reduced motion: crossfade (dip the deck out, swap, fade back) instead of flipping
  useIsoLayoutEffect(() => {
    if (!reduced || !webgl) return setShown(step)
    if (step === shown) return
    setDip((d) => d + 1)
    const t = window.setTimeout(() => setShown(step), 180)
    return () => window.clearTimeout(t)
  }, [step, reduced, webgl, shown])

  // text swap: old block slides up + fades, new block masks up line by line
  useIsoLayoutEffect(() => {
    blocks.current.forEach((el, i) => {
      if (!el) return
      if (i === active) {
        if (first.current) {
          el.dataset.s = 'in'
          return
        }
        el.dataset.s = 'idle'
        void el.offsetHeight // commit the reset before transitioning in
        el.dataset.s = 'in'
      } else if (el.dataset.s === 'in') el.dataset.s = 'out'
      else if (el.dataset.s !== 'out') el.dataset.s = 'idle'
    })
    first.current = false
  }, [active])

  const f = PRODUCT_FINISHES[active]

  return (
    <section className="product" aria-labelledby="product-title">
      <div className="deck" data-ready={ready} data-dip={reduced ? dip % 2 : undefined}>
        <div className="deck__glows" aria-hidden>
          {PRODUCT_FINISHES.map((g, i) => (
            <span key={g.id} style={{ background: `radial-gradient(closest-side, ${g.glow} 0%, ${g.glow} 38%, transparent 100%)` }} data-on={i === active} />
          ))}
        </div>
        <div className="deck__shadow" aria-hidden />
        {/* the flat card is the poster (and the no-WebGL fallback); it fades out once the 3D deck is live */}
        <img
          className="deck__fallback"
          data-hidden={webgl && !failed && ready}
          src={`/cards/${f.id}-2d.webp`}
          alt={`Zapricot metal EV charging card in ${f.name}`}
          width={CARD_IMAGE_2D.width}
          height={CARD_IMAGE_2D.height}
          {...HIGH_PRIORITY}
        />
        {webgl && !failed && boot && (
          <SceneBoundary fallback={<ReportFail onFail={onFail} />}>
            <Suspense fallback={null}>
              <ProductDeck target={reduced ? shown : step} reduced={reduced} onPick={goTo} onReady={() => setReady(true)} onFail={onFail} active={pageVisible} />
            </Suspense>
          </SceneBoundary>
        )}
      </div>

      <div className="pcol">
        <header className="pcol__head">
          <h1 id="product-title" className="pcol__title fade-up" style={{ ['--d' as string]: '1050ms' }}>Tap. Charge. Go.</h1>
          <p className="pcol__sub fade-up" style={{ ['--d' as string]: '1130ms' }}>One card that works across EV charging networks.</p>
        </header>

        <div className="finish fade-up" style={{ ['--d' as string]: '1220ms' }}>
          <ol className="ticks" aria-label="Finishes">
            {PRODUCT_FINISHES.map((g, i) => (
              <li key={g.id}>
                <button
                  className="tick"
                  data-on={i === active}
                  aria-current={i === active ? 'true' : undefined}
                  aria-label={`${g.name}, ${i + 1} of ${PRODUCT_FINISHES.length}`}
                  onClick={() => goTo(i)}
                >
                  <span />
                </button>
              </li>
            ))}
          </ol>

          <div className="finish__stage">
            {PRODUCT_FINISHES.map((g, i) => (
              <div key={g.id} className="finish__block" ref={(el) => (blocks.current[i] = el)} data-s="idle" aria-hidden={i !== active}>
                <h2 className="finish__name"><span className="finish__line"><span style={{ ['--i' as string]: 0 }}>{g.name}</span></span></h2>
                <p className="finish__vibe"><span className="finish__line"><span style={{ ['--i' as string]: 1 }}>{g.vibe}</span></span></p>
                {/* TODO(specs): material / weight / thickness / chip go here once confirmed — do not invent. */}
              </div>
            ))}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">{`${f.name}, ${active + 1} of ${PRODUCT_FINISHES.length}`}</p>

        <footer className="pcol__foot fade-up" style={{ ['--d' as string]: '1320ms' }}>
          <Link href="/" className="back-link">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M11 7H3m0 0l3.5-3.5M3 7l3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Back to home</span>
          </Link>
          <p className="hint" data-hidden={touched} aria-hidden={touched}>
            <span className="hint__icon" aria-hidden />
            {mobile ? 'Swipe to flip' : 'Scroll to flip'}
          </p>
        </footer>
      </div>
    </section>
  )
}

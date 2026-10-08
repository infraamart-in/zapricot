import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import images from '../aboutImages.json'
import { SiteFooter } from '../components/SiteFooter'

type Slot = keyof typeof images
type Img = { widths: number[]; width: number; height: number; standIn: boolean } | null

/** Responsive AVIF/WebP with intrinsic size set, so nothing shifts while loading. */
function Pic({ slot, sizes, alt, eager, position, className }: { slot: Slot; sizes: string; alt: string; eager?: boolean; position?: string; className?: string }) {
  const img = images[slot] as Img
  if (!img) return null
  const set = (ext: string) => img.widths.map((w) => `/about/${slot}-${w}.${ext} ${w}w`).join(', ')
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={`/about/${slot}-${img.widths[0]}.webp`}
        width={img.width}
        height={img.height}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        {...(eager ? { fetchpriority: 'high' } : {})}
        style={position ? ({ objectPosition: position } as CSSProperties) : undefined}
      />
    </picture>
  )
}

/** One gentle fade-in when a section first enters the viewport (opacity only, once). */
function useReveal() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    el.classList.add('reveal-on')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [])
  return root
}

/** Eyebrow label. As an <h2> it heads sections that have no other heading; styling is identical. */
function Label({ children, heading, id }: { children: ReactNode; heading?: boolean; id?: string }) {
  return heading ? <h2 className="ab-label" id={id}>{children}</h2> : <p className="ab-label">{children}</p>
}

/** Image panel + text on the 12-col grid. `side` is where the image sits on desktop; on mobile it always comes first. */
function Split({ side, slot, alt, position, eager, className, labelledBy, children }: { side: 'left' | 'right'; slot: Slot; alt: string; position: string; eager?: boolean; className?: string; labelledBy: string; children: ReactNode }) {
  return (
    <section className={`ab-split ab-split--img-${side} ${className ?? ''}`} aria-labelledby={labelledBy} data-reveal={eager ? undefined : ''}>
      <Pic slot={slot} className="ab-split__img" sizes="(max-width: 900px) 100vw, 46vw" alt={alt} eager={eager} position={position} />
      <div className="ab-split__text">{children}</div>
    </section>
  )
}

const FOUNDERS = [
  {
    name: 'Naveen Panya',
    role: 'Co-Founder & CEO',
    line: 'B.Arch, MNIT Jaipur. An EV owner who lived the problem first-hand and decided to fix it.',
  },
  {
    name: 'Chetan Dora',
    role: 'Co-Founder & CMO',
    line: 'B.Arch, MNIT Jaipur. Leads brand and product design, the reason the card looks the way it does.',
  },
]

export function About({ onContact }: { onContact: () => void }) {
  const root = useReveal()

  return (
    <div className="about" ref={root}>
      {/* 1–4: one zig-zag. Every panel shares radius, height and gap; only the side alternates. */}
      <Split
        side="right"
        slot="about-hero"
        eager
        alt="A hand holding up a brushed titanium Zapricot EV charging card"
        position="50% 42%"
        className="ab-split--hero"
        labelledBy="ab-hero-title"
      >
        <h1 id="ab-hero-title" className="ab-display">Charging should be the easy part.</h1>
        <p className="ab-body">
          Owning an EV in India is great. Finding a charger is getting easier. Paying for one is still weirdly complicated. We’re fixing that bit.
        </p>
      </Split>

      <Split side="left" slot="about-vision-grid" alt="Zapricot metal EV charging cards in Copper, Graphite, Titanium and Champagne Gold, fanned out" position="50% 72%" labelledBy="ab-vision-label">
        <Label heading id="ab-vision-label">
          Our vision
        </Label>
        <p className="ab-statement">
          A future where charging your EV is as simple as tapping a card. No matter whose charger it is, which app it wants, or whether your phone has signal.
        </p>
      </Split>

      <Split side="right" slot="about-building" alt="A Champagne Gold Zapricot EV charging card held between finger and thumb" position="50% 30%" labelledBy="ab-building-title">
        <Label>What we’re building</Label>
        <h2 id="ab-building-title" className="ab-headline">One card. Every network.</h2>
        <p className="ab-body">
          One card that works across EV charging networks. Tap, charge, drive off. We’re starting in Hyderabad and taking it across India from there.
        </p>
      </Split>

      <Split side="left" slot="about-origin" alt="A fingertip balancing a Midnight blue Zapricot EV charging card on its corner" position="50% 55%" labelledBy="ab-origin-label">
        <Label heading id="ab-origin-label">How it started</Label>
        <blockquote className="ab-quote" id="ab-origin-quote">
          <span className="ab-quote__mark" aria-hidden>&ldquo;</span>Why isn’t this just one tap?<span className="ab-quote__mark" aria-hidden>&rdquo;</span>
        </blockquote>
        <p className="ab-body">
          One of us drives an EV. After one too many evenings juggling apps, logins and failed top-ups at a charger, the question was simple. So two architects did what architects do: redesigned the experience from the ground up.
        </p>
      </Split>

      {/* 5 — Founders */}
      <section className="ab-founders" aria-labelledby="ab-founders-label" data-reveal>
        <Label heading id="ab-founders-label">
          The founders
        </Label>
        <div className="ab-founders__grid">
          {FOUNDERS.map((f) => {
            return (
              <article className="founder" key={f.name}>
                <div className="founder__meta">
                  <div>
                    <h3 className="founder__name">{f.name}</h3>
                    <p className="founder__role">{f.role}</p>
                  </div>
                </div>
                <p className="founder__line">{f.line}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* 6 — Partners & investors */}
      <section className="ab-partners" aria-labelledby="ab-partners-title" data-reveal>
        <Pic slot="about-partners" className="ab-partners__bg" sizes="100vw" alt="" position="50% 50%" />
        <div className="ab-partners__inner">
          <Label>Partners &amp; investors</Label>
          <h2 id="ab-partners-title" className="ab-headline">Build this with us.</h2>
          <p className="ab-body">
            We’re early, and we’re looking for people who want to shape how India charges. Investors who believe in EV infrastructure. Charging networks and EV makers who want happier drivers.
          </p>
          <button className="btn" onClick={onContact} aria-haspopup="dialog">
            Let’s talk
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </section>

      {/* 7 — Footer */}
      <SiteFooter onContact={onContact} />
    </div>
  )
}

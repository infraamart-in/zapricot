import { CARD_IMAGE_2D } from '../cardSpec'

/** 2D stand-in when WebGL is unavailable: a fanned stack with a slow CSS float. */
export function RingFallback() {
  const order = ['midnight', 'copper', 'gold', 'titanium', 'graphite'] as const
  return (
    <div className="ring-fallback" aria-hidden>
      {order.map((id, i) => (
        <img key={id} src={`/cards/${id}-2d.webp`} alt="" width={CARD_IMAGE_2D.width} height={CARD_IMAGE_2D.height} style={{ ['--i' as string]: i - 2 }} />
      ))}
    </div>
  )
}

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <h1 id="hero-title" className="hero__title">
          <span className="line"><span className="reveal" style={{ ['--d' as string]: '0ms' }}>One card for</span></span>
          <span className="line"><span className="reveal accent" style={{ ['--d' as string]: '90ms' }}>every EV charger.</span></span>
        </h1>
        <p className="hero__sub reveal" style={{ ['--d' as string]: '200ms' }}>Launching soon</p>
      </div>
    </section>
  )
}

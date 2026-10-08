import { Link } from '../lib/router'

export function NotFound() {
  return (
    <section className="placeholder" aria-labelledby="nf-title">
      <img className="placeholder__mark reveal" src="/img/mark.png" alt="" width={56} height={58} style={{ ['--d' as string]: '0ms' }} />
      <p className="eyebrow reveal" style={{ ['--d' as string]: '80ms' }}>404</p>
      <h1 id="nf-title" className="placeholder__title nf__title">
        <span className="line"><span className="reveal" style={{ ['--d' as string]: '160ms' }}>This page took</span></span>
        <span className="line"><span className="reveal accent" style={{ ['--d' as string]: '230ms' }}>a wrong turn.</span></span>
      </h1>
      <Link href="/" className="placeholder__back reveal" style={{ ['--d' as string]: '340ms' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M11 7H3m0 0l3.5-3.5M3 7l3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back to home
      </Link>
    </section>
  )
}

import { Link } from '../lib/router'

/** "Privacy · Terms · © zapricot 2026" — the same three items everywhere. */
function LegalLinks() {
  return (
    <>
      <Link href="/privacy" className="legal-link">Privacy</Link>
      <span aria-hidden className="legal-dot">·</span>
      <Link href="/terms" className="legal-link">Terms</Link>
      <span aria-hidden className="legal-dot">·</span>
      <span className="legal-copy">&copy; zapricot 2026</span>
    </>
  )
}

/** Full footer for scrolling pages (About, Privacy, Terms). */
export function SiteFooter({ onContact }: { onContact: () => void }) {
  return (
    <footer className="ab-footer">
      <img src="/img/wordmark.png" alt="Zapricot" width={131} height={24} loading="lazy" />
      <nav className="ab-footer__legal" aria-label="Legal">
        <LegalLinks />
      </nav>
      <button className="back-link" onClick={onContact} aria-haspopup="dialog">
        <span>Contact</span>
      </button>
    </footer>
  )
}

/** Tiny, low-contrast line along the bottom edge of the fixed-screen pages (Home, Product, 404). */
export function LegalBar() {
  return (
    <footer className="legal-bar">
      <nav aria-label="Legal">
        <LegalLinks />
      </nav>
    </footer>
  )
}

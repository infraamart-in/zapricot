import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, usePath } from '../lib/router'
import { EARLY_ACCESS_URL } from '../config'

const LINKS = [
  { href: '/about', label: 'About' },
  { href: '/product', label: 'Product' },
]

type Props = { onContact: () => void; contactOpen: boolean }

export function Nav({ onContact, contactOpen }: Props) {
  const path = usePath()
  const [open, setOpen] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const firstItem = useRef<HTMLAnchorElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => setOpen(false), [path])

  // on scrolling pages the bar turns into a translucent material once content passes under it
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [path])

  // full-screen menu: lock the page behind it, focus the first item, Esc closes and returns focus
  useEffect(() => {
    const main = document.getElementById('main')
    document.documentElement.toggleAttribute('data-menu-open', open)
    if (main) main.inert = open
    if (!open) return
    // the menu is portalled after mount; focus once it exists
    const raf = requestAnimationFrame(() => firstItem.current?.focus({ preventScroll: true }))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setOpen(false)
        menuBtn.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      document.documentElement.removeAttribute('data-menu-open')
      if (main) main.inert = false
    }
  }, [open, mounted])

  const closeThen = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <header className="nav" data-solid={solid || open}>
      <Link href="/" className="nav__brand" aria-label="Zapricot home">
        <img src="/img/wordmark.png" alt="Zapricot" width={131} height={24} />
      </Link>

      <nav className="nav__links" aria-label="Primary">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="nav__link" aria-current={path === l.href ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        <button className="nav__link" onClick={onContact} aria-haspopup="dialog" data-active={contactOpen}>
          Contact
        </button>
      </nav>

      <div className="nav__right">
        <a className="pill" href={EARLY_ACCESS_URL} target="_blank" rel="noopener noreferrer">
          <span className="pill__dot" aria-hidden />
          Early access
        </a>
        <button
          ref={menuBtn}
          className="nav__menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          data-open={open}
          data-focus-fallback
        >
          <span />
          <span />
        </button>
      </div>

      {/* portalled to <body> so no ancestor (transform/backdrop-filter) can clip the full-screen layer */}
      {mounted && createPortal(
      <div id="mobile-menu" className="menu" data-open={open} hidden={!open}>
        <nav className="menu__list" aria-label="Menu">
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              ref={i === 0 ? firstItem : undefined}
              href={l.href}
              className="menu__item"
              aria-current={path === l.href ? 'page' : undefined}
              style={{ ['--i' as string]: i }}
            >
              {l.label}
            </Link>
          ))}
          <button className="menu__item" aria-haspopup="dialog" onClick={closeThen(onContact)} style={{ ['--i' as string]: 2 }}>
            Contact
          </button>
        </nav>
        <a className="btn menu__cta" href={EARLY_ACCESS_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={{ ['--i' as string]: 3 }}>
          Early access
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>,
        document.body,
      )}
    </header>
  )
}

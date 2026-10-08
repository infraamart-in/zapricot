/**
 * Single source of truth for per-page SEO: used at build time (prerendered <head>) and in the
 * browser (updating <head> on client-side navigation). Brand name in metadata is "Zapricot".
 */
import { CONTACT } from '../config'

declare const __SITE_URL__: string
/** Canonical origin, injected at build time from the SITE_URL env var (no trailing slash). */
export const SITE_URL: string = typeof __SITE_URL__ !== 'undefined' ? __SITE_URL__ : 'https://zapricot.in'
export const SITE_NAME = 'Zapricot'

// TODO(linkedin): add the LinkedIn company page URL here once it exists; it is added to sameAs automatically.
export const LINKEDIN_COMPANY_URL = ''

type Meta = { title: string; description: string; image: string; imageAlt: string }

const OG_SITE = { image: '/og/zapricot-og.jpg', imageAlt: 'Zapricot metal EV charging cards in a ring on a dark background, with the line “One card for every EV charger.”' }
const OG_PRODUCT = { image: '/og/zapricot-card-og.jpg', imageAlt: 'The Zapricot card in Champagne Gold, a metal tap-to-charge card for EVs' }

export const META: Record<string, Meta> = {
  '/': {
    title: 'Zapricot — One card for every EV charger',
    description: 'One tap to charge your EV across charging networks in India. Launching soon in Hyderabad. Join early access.',
    ...OG_SITE,
  },
  '/product': {
    title: 'The Zapricot Card — Tap. Charge. Go.',
    description: 'A metal tap-to-charge card for EVs, in five finishes. Works across EV charging networks. Coming soon to India.',
    ...OG_PRODUCT,
  },
  '/about': {
    title: 'About Zapricot — Making EV charging simple',
    description: 'Founded by Naveen Panya and Chetan Dora (MNIT Jaipur), Zapricot is building one card for every EV charger in India.',
    ...OG_SITE,
  },
  '/privacy': {
    title: 'Privacy Policy — Zapricot',
    description: 'How Zapricot collects, uses and protects the details you share through the early access form, and how to exercise your rights.',
    ...OG_SITE,
  },
  '/terms': {
    title: 'Terms of Use — Zapricot',
    description: 'The terms for using the Zapricot pre-launch website: early access, intellectual property, acceptable use and governing law.',
    ...OG_SITE,
  },
}

export const NOT_FOUND: Meta = {
  title: 'Page not found — Zapricot',
  description: 'This page took a wrong turn. Head back to Zapricot, one card for every EV charger.',
  ...OG_SITE,
}

export const canonical = (path: string) => `${SITE_URL}${path === '/' ? '/' : path}`

// ---- structured data ---------------------------------------------------------------------
export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo-512.png`, width: 512, height: 512 },
    image: `${SITE_URL}${OG_SITE.image}`,
    description: 'Zapricot is building one tap-to-charge card that works across EV charging networks in India, launching first in Hyderabad.',
    email: CONTACT.email,
    address: { '@type': 'PostalAddress', addressLocality: 'Hyderabad', addressRegion: 'Telangana', addressCountry: 'IN' },
    founder: [
      { '@type': 'Person', name: 'Naveen Panya', jobTitle: 'Co-Founder & CEO' },
      { '@type': 'Person', name: 'Chetan Dora', jobTitle: 'Co-Founder & CMO' },
    ],
    sameAs: [CONTACT.instagramHref, LINKEDIN_COMPANY_URL].filter(Boolean),
  }
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    inLanguage: 'en-IN',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}

// ---- build-time <head> --------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** JSON for a <script> tag: escape "<" so no string can close the tag. */
const ldJson = (o: object) => JSON.stringify(o).replace(/</g, '\\u003c')

export function buildHead(path: string, isNotFound = false) {
  const m = isNotFound ? NOT_FOUND : (META[path] ?? NOT_FOUND)
  const url = canonical(path)
  const img = `${SITE_URL}${m.image}`
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    isNotFound ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}" />`,
    `<script type="application/ld+json">${ldJson(organizationLd())}</script>`,
  ]
  if (path === '/' && !isNotFound) tags.push(`<script type="application/ld+json">${ldJson(websiteLd())}</script>`)
  return tags.join('\n    ')
}

// ---- client-side navigation ---------------------------------------------------------------
function setAttr(selector: string, attr: 'content' | 'href', value: string) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

export function applyMeta(path: string) {
  const known = !!META[path]
  const m = META[path] ?? NOT_FOUND
  const url = canonical(path)
  document.title = m.title
  setAttr('meta[name="description"]', 'content', m.description)
  for (const [sel, v] of [
    ['meta[property="og:title"]', m.title],
    ['meta[property="og:description"]', m.description],
    ['meta[property="og:url"]', url],
    ['meta[property="og:image"]', `${SITE_URL}${m.image}`],
    ['meta[property="og:image:alt"]', m.imageAlt],
    ['meta[name="twitter:title"]', m.title],
    ['meta[name="twitter:description"]', m.description],
    ['meta[name="twitter:image"]', `${SITE_URL}${m.image}`],
    ['meta[name="twitter:image:alt"]', m.imageAlt],
  ] as const)
    setAttr(sel, 'content', v)
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (known) {
    robots?.remove()
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = url
  } else {
    link?.remove()
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      robots.content = 'noindex'
      document.head.appendChild(robots)
    }
  }
}

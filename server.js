// Zapricot production server: serves the prerendered Vite site from dist/.
//   GET /api/health   liveness check
// Early access is a Google Form (EARLY_ACCESS_URL in src/config.ts), opened in a new tab.
// Start: `npm start` (after `npm run build`). Listens on process.env.PORT.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'

process.env.NODE_ENV ||= 'production'
const env = process.env
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(env.PORT) || 3000
const log = (msg) => console.log(`[server] ${msg}`)

// the old /early-access entry point now goes to the Google Form (kept in sync with src/config.ts)
const EARLY_ACCESS_URL = 'https://forms.gle/yuqt18titG8Y3pSC7'

// canonical origin (www is redirected to it); SITE_URL like https://zapricot.in
let canonical = new URL('https://zapricot.in')
try {
  if (env.SITE_URL) canonical = new URL(env.SITE_URL)
} catch {
  console.error('[server] invalid_env:SITE_URL (not a URL)')
}
const apexHostname = canonical.hostname.replace(/^www\./, '')
const apexOrigin = `${canonical.protocol}//${canonical.host.replace(/^www\./, '')}`

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[server] dist/index.html not found: run `npm run build` before `npm start`')
  process.exit(1)
}

// ---- pages: prerendered HTML, read once ---------------------------------------------------
const page = (file) => fs.readFileSync(path.join(DIST, file), 'utf8')
const PAGES = {
  '/': page('index.html'),
  '/product': page('product.html'),
  '/about': page('about.html'),
  '/privacy': page('privacy.html'),
  '/terms': page('terms.html'),
}
PAGES['/contact'] = PAGES['/'] // the app opens the Contact dialog over the home page
const NOT_FOUND = page('404.html')

// ---- app -------------------------------------------------------------------------------------
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true) // behind Hostinger's proxy: honour X-Forwarded-*

// www → apex (301)
app.use((req, res, next) => {
  if (req.hostname === `www.${apexHostname}`) return res.redirect(301, `${apexOrigin}${req.originalUrl}`)
  next()
})

// security headers
const csp = (upgrade) => ({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    ...(upgrade ? { upgradeInsecureRequests: [] } : {}),
  },
})
const securityHeaders = (local) =>
  helmet({
    contentSecurityPolicy: csp(!local),
    strictTransportSecurity: local ? false : { maxAge: 63072000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
  })
const remoteHeaders = securityHeaders(false)
const localHeaders = securityHeaders(true) // http://localhost testing: no HSTS / upgrade-insecure-requests
app.use((req, res, next) => (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(req.hostname) ? localHeaders : remoteHeaders)(req, res, next))
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()')
  next()
})
app.use(compression())

// ---- API ------------------------------------------------------------------------------------
const api = express.Router()
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
api.get('/health', (_req, res) => res.json({ status: 'ok', node: process.version, uptime_s: Math.round(process.uptime()) }))
api.use((_req, res) => res.status(404).json({ error: 'Not found.' }))
app.use('/api', api)

// ---- site -----------------------------------------------------------------------------------
app.get('/early-access', (_req, res) => res.redirect(302, EARLY_ACCESS_URL))

// clean URLs: /about.html → /about, /about/ → /about
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  const [pathname, query = ''] = req.originalUrl.split('?')
  const qs = query ? `?${query}` : ''
  if (pathname === '/index.html') return res.redirect(301, `/${qs}`)
  if (pathname.endsWith('.html') && PAGES[pathname.slice(0, -5)]) return res.redirect(301, `${pathname.slice(0, -5)}${qs}`)
  if (pathname.length > 1 && pathname.endsWith('/')) return res.redirect(301, `${pathname.replace(/\/+$/, '') || '/'}${qs}`)
  next()
})

const LONG = 'public, max-age=31536000, immutable'
const MONTH = 'public, max-age=2592000'
app.use(
  express.static(DIST, {
    index: false, // pages are served below
    redirect: false,
    setHeaders(res, file) {
      const rel = path.relative(DIST, file).split(path.sep).join('/')
      if (rel.startsWith('assets/') || rel.startsWith('fonts/')) res.setHeader('Cache-Control', LONG)
      else if (rel.startsWith('cards/') || rel.startsWith('about/')) res.setHeader('Cache-Control', MONTH)
      else if (rel.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
    },
  }),
)

const sendHtml = (res, status, html) => {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.send(html)
}
// app routes → their prerendered page. Any other path gets the app shell with a real 404 status
// (the client router renders the Not Found page), so search engines never index soft-404s.
app.get('*', (req, res) => {
  const html = PAGES[req.path]
  if (html) return sendHtml(res, 200, html)
  sendHtml(res, 404, NOT_FOUND)
})

app.listen(PORT, () => log(`listening on port ${PORT} (NODE_ENV=${env.NODE_ENV}, node ${process.version})`))

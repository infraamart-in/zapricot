// Zapricot production server: serves the prerendered Vite site from dist/ and the form API.
//   GET  /api/health    config + dependency status (no secrets)
//   POST /api/register  early-access form → validation, Turnstile, rate limit, Jotform
// Start: `npm start` (after `npm run build`). Listens on process.env.PORT.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import { handleRegister } from './server-dist/register.js'

// this file is the production server: default to production (Turnstile fails closed, no localhost origins)
process.env.NODE_ENV ||= 'production'
const env = process.env
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(env.PORT) || 3000
const log = (msg) => console.log(`[server] ${msg}`)

// ---- configuration check (names only, never values) ---------------------------------------
const REQUIRED = ['TURNSTILE_SECRET_KEY', 'VITE_TURNSTILE_SITE_KEY', 'SITE_URL']
const OPTIONAL = {
  JOTFORM_API_KEY: 'posting to the public Jotform submit endpoint instead of the API',
  JOTFORM_FORM_ID: 'using the built-in form id',
  UPSTASH_REDIS_REST_URL: 'rate limiting is per server process only',
  UPSTASH_REDIS_REST_TOKEN: 'rate limiting is per server process only',
}
const missing = REQUIRED.filter((k) => !env[k])
const missingOptional = Object.keys(OPTIONAL).filter((k) => !env[k])
for (const k of missing) console.error(`[server] missing_env:${k}`)
for (const k of missingOptional) log(`missing_env:${k} (optional: ${OPTIONAL[k]})`)
if (env.JOTFORM_DRY_RUN === '1') log('JOTFORM_DRY_RUN=1: submissions are NOT forwarded to Jotform')

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

// ---- pages: prerendered HTML, read once, with the Turnstile site key injected at runtime ------
const siteKeyMeta = env.VITE_TURNSTILE_SITE_KEY
  ? `<meta name="zap-turnstile-site-key" content="${env.VITE_TURNSTILE_SITE_KEY.replace(/[^A-Za-z0-9_-]/g, '')}">`
  : ''
const page = (file) => fs.readFileSync(path.join(DIST, file), 'utf8').replace('</head>', `${siteKeyMeta}</head>`)
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
// behind Hostinger's proxy: honour X-Forwarded-* (client IP for rate limiting, protocol)
app.set('trust proxy', true)

// www → apex (301), like the old Vercel redirect
app.use((req, res, next) => {
  if (req.hostname === `www.${apexHostname}`) return res.redirect(301, `${apexOrigin}${req.originalUrl}`)
  next()
})

// security headers (moved from vercel.json)
const csp = (upgrade) => ({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
    frameSrc: ['https://challenges.cloudflare.com'],
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

// Upstash reachability, cached for a minute (so /api/health can't be used to hammer it)
let upstashCache = { at: 0, status: 'not_configured' }
async function upstashStatus() {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return 'not_configured'
  if (Date.now() - upstashCache.at < 60_000) return upstashCache.status
  let status
  try {
    const r = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
      headers: { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(3000),
    })
    status = r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'auth_failed' : `error_${r.status}`
  } catch {
    status = 'unreachable'
  }
  if (status === 'auth_failed') console.error('[server] upstash_auth_failed (health check)')
  upstashCache = { at: Date.now(), status }
  return status
}

api.get('/health', async (_req, res) => {
  const upstash = await upstashStatus()
  res.json({
    status: missing.length ? 'misconfigured' : 'ok',
    missing_env: missing,
    optional_missing_env: missingOptional,
    turnstile: env.TURNSTILE_SECRET_KEY && env.VITE_TURNSTILE_SITE_KEY ? 'configured' : 'missing',
    jotform: env.JOTFORM_DRY_RUN === '1' ? 'dry_run' : env.JOTFORM_API_KEY ? 'api' : 'public_endpoint',
    upstash,
    node: process.version,
    uptime_s: Math.round(process.uptime()),
  })
})

// Express request → Web Request for the shared handler (server/register.ts)
async function toWebRequest(req) {
  const chunks = []
  let size = 0
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) {
      size += chunk.length
      chunks.push(chunk)
      if (size > 16 * 1024) break // the handler rejects anything over 4 KB anyway
    }
  }
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(', '))
  }
  headers.set('x-forwarded-for', req.ip || 'unknown') // client IP as resolved through the proxy
  return new Request(`${apexOrigin}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  })
}

const dryRunFetch = async (url, init) => {
  if (String(url).includes('jotform')) {
    log('JOTFORM_DRY_RUN: would forward a submission')
    return new Response('{}', { status: 200 })
  }
  return fetch(url, init)
}

api.all('/register', async (req, res) => {
  try {
    const out = await handleRegister(await toWebRequest(req), env, {
      fetch: env.JOTFORM_DRY_RUN === '1' ? dryRunFetch : fetch,
      now: Date.now,
    })
    res.status(out.status)
    out.headers.forEach((v, k) => res.setHeader(k, v))
    res.send(Buffer.from(await out.arrayBuffer()))
  } catch (err) {
    console.error('[register] internal_error', err instanceof Error ? err.name : 'unknown')
    res.status(500).json({ error: 'Something went wrong. Please try again, or use the hosted form.' })
  }
})

api.use((_req, res) => res.status(404).json({ error: 'Not found.' }))
app.use('/api', api)

// ---- site -----------------------------------------------------------------------------------
// clean URLs like the old Vercel config: /about.html → /about, /about/ → /about
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
    index: false, // pages are served below (with the runtime meta)
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

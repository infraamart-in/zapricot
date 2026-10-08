/**
 * Server-side core for POST /api/register. Pure Web-standard (Request → Response) so it runs on
 * Vercel functions, in the Vite dev server, and in unit tests. Nothing here is shipped to the browser.
 *
 * Pipeline: method/type/size/origin → JSON → allow-listed fields → sanitise + validate →
 * honeypot → time-to-submit → rate limit (per IP) → Turnstile → forward to Jotform.
 * Every failure returns a short generic message; details are only logged server-side.
 */

export type Env = {
  JOTFORM_FORM_ID?: string
  JOTFORM_API_KEY?: string // optional; without it we post to Jotform's public submit endpoint
  TURNSTILE_SECRET_KEY?: string
  SITE_URL?: string // e.g. https://zapricot.in  used to check the Origin header
  UPSTASH_REDIS_REST_URL?: string // optional: durable, cross-instance rate limiting
  UPSTASH_REDIS_REST_TOKEN?: string
  NODE_ENV?: string
  VERCEL_ENV?: string
}

type Deps = { fetch: typeof fetch; now: () => number }

const DEFAULT_FORM_ID = '262801925141048'
const MAX_BODY = 4096
const MIN_FILL_MS = 3000
const MAX_FILL_MS = 2 * 60 * 60 * 1000
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000
const ALLOWED = new Set(['name', 'email', 'phone', 'city', 'car', 'consent', 'company', 'elapsedMs', 'turnstileToken'])

// Jotform question ids (form 262801925141048): 2 full name, 3 email, 4 phone, 5 city, 6 car, 8 consent, 9 consent time
export const JOTFORM_QIDS = { name: 2, email: 3, phone: 4, city: 5, car: 6, consent: 8, consentTime: 9 }
export const CONSENT_TEXT = 'I agree to zapricot contacting me about early access, as described in the Privacy Policy.'

const MSG = {
  invalid: 'Please check your details and try again.',
  rate: 'Too many attempts. Please try again in a few minutes.',
  failed: 'Something went wrong. Please try again, or use the hosted form.',
  method: 'Method not allowed.',
}

function json(status: number, body: object, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  })
}

// control chars, zero-width chars and line/paragraph separators (built from code points so no editor can mangle them)
const ch = (n: number) => String.fromCharCode(n)
const INVISIBLE = new RegExp(`[${ch(0)}-${ch(0x1f)}${ch(0x7f)}${ch(0x200b)}-${ch(0x200f)}${ch(0x2028)}${ch(0x2029)}]`, 'g')

/** Strip markup, script/style blocks, control chars; collapse whitespace. */
export function clean(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null
  let s = input.normalize('NFKC')
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  s = s.replace(/<[^>]*>/g, ' ')
  s = s.replace(/[<>]/g, '')
  s = s.replace(INVISIBLE, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (!s || s.length > max) return null
  return s
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function indianMobile(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 20) return null
  let d = raw.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

export type Clean = { name: string; email: string; phone: string; city: string; car: string }

export function validate(body: Record<string, unknown>): Clean | null {
  const name = clean(body.name, 80)
  const emailRaw = clean(body.email, 254)
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw.toLowerCase() : null
  const phone = indianMobile(body.phone)
  const city = clean(body.city, 60)
  const car = clean(body.car, 60)
  if (!name || name.length < 2 || !email || !phone || !city || city.length < 2 || !car || body.consent !== true) return null
  return { name, email, phone, city, car }
}

// ---- rate limiting ------------------------------------------------------------------------
const memory = new Map<string, number[]>()

export function resetRateLimit() {
  memory.clear()
}

async function rateLimited(ip: string, env: Env, deps: Deps): Promise<boolean> {
  const now = deps.now()
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const key = `zap:reg:${ip}:${Math.floor(now / RATE_WINDOW_MS)}`
      const res = await deps.fetch(`${env.UPSTASH_REDIS_REST_URL}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify([['INCR', key], ['EXPIRE', key, Math.ceil(RATE_WINDOW_MS / 1000), 'NX']]),
      })
      const out = (await res.json()) as { result: number }[]
      return out[0].result > RATE_LIMIT
    } catch {
      // fall through to the in-memory limiter
    }
  }
  // best effort per warm instance (sliding window)
  const hits = (memory.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  memory.set(ip, hits)
  if (memory.size > 5000) memory.delete(memory.keys().next().value as string)
  return hits.length > RATE_LIMIT
}

function clientIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim()
}

// ---- Turnstile ----------------------------------------------------------------------------
async function turnstileOk(token: unknown, ip: string, env: Env, deps: Deps): Promise<boolean> {
  const production = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
  if (!env.TURNSTILE_SECRET_KEY) return !production // fail closed in production if not configured
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
  if (ip !== 'unknown') form.set('remoteip', ip)
  try {
    const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const out = (await res.json()) as { success?: boolean }
    return out.success === true
  } catch {
    return false
  }
}

// ---- Jotform ------------------------------------------------------------------------------
async function forward(c: Clean, consentTime: string, env: Env, deps: Deps): Promise<boolean> {
  const formId = env.JOTFORM_FORM_ID || DEFAULT_FORM_ID
  const [first, ...rest] = c.name.split(' ')
  const q = JOTFORM_QIDS
  const fields: [string, string][] = [
    [`${q.name}][first`, first],
    [`${q.name}][last`, rest.join(' ')],
    [`${q.email}`, c.email],
    [`${q.phone}][country`, '+91'],
    [`${q.phone}][area`, c.phone.slice(0, 5)],
    [`${q.phone}][phone`, c.phone.slice(5)],
    [`${q.city}`, c.city],
    [`${q.car}`, c.car],
    [`${q.consent}`, CONSENT_TEXT],
    [`${q.consentTime}`, consentTime],
  ]
  const body = new URLSearchParams()
  let url: string
  if (env.JOTFORM_API_KEY) {
    // authenticated REST API  key never leaves the server
    for (const [k, v] of fields) body.append(`submission[${k}]`, v)
    url = `https://api.jotform.com/form/${encodeURIComponent(formId)}/submissions?apiKey=${encodeURIComponent(env.JOTFORM_API_KEY)}`
  } else {
    // public submit endpoint, same as the hosted form
    body.append('formID', formId)
    body.append('simple_spc', `${formId}-${formId}`)
    const names: Record<string, string> = {
      [`${q.name}][first`]: 'q2_q2_fullname0[first]',
      [`${q.name}][last`]: 'q2_q2_fullname0[last]',
      [`${q.email}`]: 'q3_q3_email1',
      [`${q.phone}][country`]: 'q4_q4_phone2[country]',
      [`${q.phone}][area`]: 'q4_q4_phone2[area]',
      [`${q.phone}][phone`]: 'q4_q4_phone2[phone]',
      [`${q.city}`]: 'q5_q5_textbox3',
      [`${q.car}`]: 'q6_q6_textbox4',
      [`${q.consent}`]: CONSENT_FIELD_NAMES.consent,
      [`${q.consentTime}`]: CONSENT_FIELD_NAMES.consentTime,
    }
    for (const [k, v] of fields) body.append(names[k], v)
    url = `https://submit.jotform.com/submit/${encodeURIComponent(formId)}`
  }
  try {
    const res = await deps.fetch(url, { method: 'POST', body, redirect: 'manual' })
    // API: 200 JSON; public endpoint: 200 or a 30x to the thank-you page
    return res.status < 400
  } catch {
    return false
  }
}

// public-endpoint names for the consent questions (read from the hosted form)
export const CONSENT_FIELD_NAMES = { consent: 'q8_consent[]', consentTime: 'q9_consentTime' }

// ---- handler ------------------------------------------------------------------------------
export async function handleRegister(req: Request, env: Env, deps: Deps = { fetch, now: Date.now }): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: MSG.method }, { allow: 'POST' })

  const type = req.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) return json(415, { error: MSG.invalid })

  const origin = req.headers.get('origin')
  if (origin && env.SITE_URL) {
    const allowed = new Set([new URL(env.SITE_URL).origin])
    const site = new URL(env.SITE_URL)
    allowed.add(`${site.protocol}//www.${site.host.replace(/^www\./, '')}`)
    allowed.add(`${site.protocol}//${site.host.replace(/^www\./, '')}`)
    const isPreview = env.VERCEL_ENV === 'preview' && origin.endsWith('.vercel.app')
    const production = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
    const isLocal = !production && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    if (!allowed.has(origin) && !isPreview && !isLocal) return json(403, { error: MSG.invalid })
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY) return json(413, { error: MSG.invalid })
  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, { error: MSG.invalid })
  }
  if (Object.keys(body).some((k) => !ALLOWED.has(k))) return json(400, { error: MSG.invalid })

  const ip = clientIp(req)
  if (await rateLimited(ip, env, deps)) return json(429, { error: MSG.rate }, { 'retry-after': '600' })

  const data = validate(body)
  if (!data) return json(400, { error: MSG.invalid })

  // bots: filled the hidden field, or submitted impossibly fast / stale. Pretend success.
  const elapsed = typeof body.elapsedMs === 'number' ? body.elapsedMs : -1
  if ((typeof body.company === 'string' && body.company.trim() !== '') || elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) {
    return json(200, { ok: true })
  }

  if (!(await turnstileOk(body.turnstileToken, ip, env, deps))) return json(400, { error: MSG.invalid })

  const ok = await forward(data, new Date(deps.now()).toISOString(), env, deps)
  if (!ok) {
    console.error('[register] forwarding to Jotform failed')
    return json(502, { error: MSG.failed })
  }
  return json(200, { ok: true })
}

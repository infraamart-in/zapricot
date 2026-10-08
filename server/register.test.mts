// Run: node server/register.test.mts   (Node ≥ 22 strips the types)
import assert from 'node:assert/strict'
import { handleRegister, resetRateLimit, clean, type Env } from './register.ts'

let t = 1_700_000_000_000
const calls: { url: string; body: string }[] = []
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url)
  calls.push({ url: u, body: String(init?.body ?? '') })
  if (u.includes('siteverify')) return new Response(JSON.stringify({ success: String(init?.body).includes('response=good') }))
  if (u.includes('jotform')) return new Response('{}', { status: 200 })
  throw new Error('unexpected fetch ' + u)
}) as typeof fetch
const deps = { fetch: fakeFetch, now: () => t }
const env: Env = { TURNSTILE_SECRET_KEY: 'secret', SITE_URL: 'https://zapricot.in', VERCEL_ENV: 'production' }

const good = { name: 'Asha Rao', email: 'asha@example.com', phone: '98765 43210', city: 'Hyderabad', car: 'Tata Nexon EV', consent: true, company: '', elapsedMs: 9000, turnstileToken: 'good' }
const req = (body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://zapricot.in/api/register', {
    method,
    headers: { 'content-type': 'application/json', origin: 'https://zapricot.in', 'x-forwarded-for': headers.ip ?? '1.1.1.1', ...headers },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
const run = async (name: string, fn: () => Promise<void>) => {
  resetRateLimit()
  calls.length = 0
  try {
    await fn()
    console.log('PASS ', name)
  } catch (e) {
    console.log('FAIL ', name, '\n      ', (e as Error).message)
    process.exitCode = 1
  }
}

await run('valid submission forwards to Jotform with consent record', async () => {
  const res = await handleRegister(req(good), env, deps)
  assert.equal(res.status, 200)
  const jf = calls.find((c) => c.url.includes('jotform'))!
  assert.ok(jf, 'jotform called')
  const p = new URLSearchParams(jf.body)
  assert.equal(p.get('q2_q2_fullname0[first]'), 'Asha')
  assert.equal(p.get('q3_q3_email1'), 'asha@example.com')
  assert.equal(`${p.get('q4_q4_phone2[area]')}${p.get('q4_q4_phone2[phone]')}`, '9876543210')
  assert.match(p.get('q8_consent[]')!, /I agree to zapricot/)
  assert.equal(p.get('q9_consentTime'), new Date(t).toISOString())
})
await run('API key path keeps the key server-side and uses submission[qid]', async () => {
  const res = await handleRegister(req(good), { ...env, JOTFORM_API_KEY: 'k3y' }, deps)
  assert.equal(res.status, 200)
  const jf = calls.find((c) => c.url.includes('api.jotform.com'))!
  assert.match(jf.url, /apiKey=k3y/)
  assert.equal(new URLSearchParams(jf.body).get('submission[8]')?.startsWith('I agree'), true)
  assert.ok(!(await res.text()).includes('k3y'), 'key never echoed')
})
await run('consent must be exactly true', async () => {
  for (const consent of [false, 'true', 1, undefined]) {
    const res = await handleRegister(req({ ...good, consent }), env, deps)
    assert.equal(res.status, 400, `consent=${consent}`)
  }
})
await run('field limits and formats', async () => {
  const bad = [
    { name: 'x'.repeat(81) },
    { name: 'A' },
    { email: 'not-an-email' },
    { email: 'a@b' },
    { phone: '12345' },
    { phone: '5876543210' },
    { city: 'y'.repeat(61) },
    { car: 'z'.repeat(61) },
    { car: '' },
  ]
  // each case from its own IP: invalid attempts also count toward the rate limit (by design)
  let n = 0
  for (const b of bad) assert.equal((await handleRegister(req({ ...good, ...b }, { ip: `10.0.0.${++n}` }), env, deps)).status, 400, JSON.stringify(b))
})
await run('HTML / script content is stripped before forwarding', async () => {
  const res = await handleRegister(req({ ...good, name: '<script>alert(1)</script>Asha <b>Rao</b>', city: 'Hyder<img src=x onerror=alert(1)>abad' }), env, deps)
  assert.equal(res.status, 200)
  const p = new URLSearchParams(calls.find((c) => c.url.includes('jotform'))!.body)
  assert.equal(p.get('q2_q2_fullname0[first]'), 'Asha')
  assert.equal(p.get('q2_q2_fullname0[last]'), 'Rao')
  assert.equal(p.get('q5_q5_textbox3'), 'Hyder abad')
  assert.equal(clean('<style>x{}</style>  hi  ', 10), 'hi')
})
await run('unexpected fields are rejected', async () => {
  assert.equal((await handleRegister(req({ ...good, isAdmin: true }), env, deps)).status, 400)
})
await run('non-JSON, arrays, oversized bodies, wrong method/type are rejected generically', async () => {
  assert.equal((await handleRegister(req('{nope'), env, deps)).status, 400)
  assert.equal((await handleRegister(req([good]), env, deps)).status, 400)
  assert.equal((await handleRegister(req({ ...good, car: 'x'.repeat(5000) }), env, deps)).status, 413)
  assert.equal((await handleRegister(req(good, { 'content-type': 'text/plain' }), env, deps)).status, 415)
  const get = await handleRegister(req(null, {}, 'GET'), env, deps)
  assert.equal(get.status, 405)
  const body = await (await handleRegister(req('{nope'), env, deps)).json()
  assert.deepEqual(Object.keys(body), ['error'])
  assert.ok(!/stack|Error:|at /.test(body.error))
})
await run('foreign Origin is refused', async () => {
  assert.equal((await handleRegister(req(good, { origin: 'https://evil.example' }), env, deps)).status, 403)
  assert.equal((await handleRegister(req(good, { origin: 'https://www.zapricot.in' }), env, deps)).status, 200)
})
await run('honeypot and too-fast submissions are silently dropped (200, nothing forwarded)', async () => {
  for (const b of [{ company: 'Acme' }, { elapsedMs: 800 }, { elapsedMs: undefined }]) {
    calls.length = 0
    const res = await handleRegister(req({ ...good, ...b }), env, deps)
    assert.equal(res.status, 200)
    assert.ok(!calls.some((c) => c.url.includes('jotform')), 'not forwarded ' + JSON.stringify(b))
  }
})
await run('Turnstile token is verified server-side; bad/missing token rejected', async () => {
  assert.equal((await handleRegister(req({ ...good, turnstileToken: 'bad' }), env, deps)).status, 400)
  assert.equal((await handleRegister(req({ ...good, turnstileToken: undefined }), env, deps)).status, 400)
})
await run('production without a Turnstile secret fails closed', async () => {
  assert.equal((await handleRegister(req(good), { SITE_URL: env.SITE_URL, VERCEL_ENV: 'production' }, deps)).status, 400)
})
await run('rate limit: 5 per 10 minutes per IP, then 429; window resets', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await handleRegister(req(good, { ip: '9.9.9.9' }), env, deps)).status, 200, 'attempt ' + (i + 1))
  const sixth = await handleRegister(req(good, { ip: '9.9.9.9' }), env, deps)
  assert.equal(sixth.status, 429)
  assert.equal(sixth.headers.get('retry-after'), '600')
  assert.equal((await handleRegister(req(good, { ip: '8.8.8.8' }), env, deps)).status, 200, 'other IP unaffected')
  t += 10 * 60 * 1000 + 1
  assert.equal((await handleRegister(req(good, { ip: '9.9.9.9' }), env, deps)).status, 200, 'after window')
})
await run('localhost origin allowed only outside production', async () => {
  const local = { origin: 'http://localhost:5173' }
  assert.equal((await handleRegister(req(good, local), { ...env, VERCEL_ENV: undefined, NODE_ENV: 'development', TURNSTILE_SECRET_KEY: 'secret' }, deps)).status, 200)
  assert.equal((await handleRegister(req(good, local), env, deps)).status, 403)
})

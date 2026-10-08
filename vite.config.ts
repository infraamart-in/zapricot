import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const ROUTES = ['/', '/product', '/about', '/privacy', '/terms']
const NL = String.fromCharCode(10)

/** Runs /api/register in the Vite dev server. Dry-run by default so local tests never reach Jotform.
 * Production (and `npm run start:local`) use server.js instead. */
function apiRoutes(env: Record<string, string>): Plugin {
  const handle = (load: () => Promise<Record<string, unknown>>) => async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/register')) return next()
    try {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'local')
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    })
    const mod = (await load()) as { handleRegister: (r: Request, e: object, d?: object) => Promise<Response> }
    const dryFetch: typeof fetch = async (url, init) => {
      if (String(url).includes('jotform') && env.JOTFORM_DRY_RUN !== '0') {
        console.log('[api/register] DRY RUN — would forward to Jotform:', String(init?.body).slice(0, 400))
        return new Response('{}', { status: 200 })
      }
      return fetch(url, init)
    }
    const out = await mod.handleRegister(request, { ...env, NODE_ENV: 'development' }, { fetch: dryFetch, now: Date.now })
    res.statusCode = out.status
    out.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(Buffer.from(await out.arrayBuffer()))
    } catch (err) {
      console.error('[api/register] local handler error', err)
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'Something went wrong.' }))
    }
  }
  return {
    name: 'zap-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handle(() => server.ssrLoadModule('/server/register.ts')))
    },
  }
}

/** SITE_URL drives canonical/OG URLs (via __SITE_URL__), robots.txt and sitemap.xml. */
function seoFiles(siteUrl: string): Plugin {
  return {
    name: 'zap-seo',
    // dev serves an empty shell (no prerender): give it a minimal head; production gets the
    // prerendered head per route from scripts/prerender.mjs
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => (ctx.server ? html.replace('<!--app-head-->', '<title>Zapricot (dev)</title>').replace('<!--app-html-->', '') : html),
    },
    closeBundle() {
      const out = path.resolve('dist')
      if (!fs.existsSync(path.join(out, 'index.html'))) return
      fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`)
      const today = new Date().toISOString().slice(0, 10)
      const urls = ROUTES.map((r) => `  <url><loc>${siteUrl}${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod></url>`).join(NL)
      fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // SITE_URL (host env var) is the canonical origin baked into canonical/OG URLs, robots.txt, sitemap.xml
  const siteUrl = (env.SITE_URL || 'https://zapricot.in').replace(/\/+$/, '')
  return {
    plugins: [react(), apiRoutes(env), seoFiles(siteUrl)],
    define: { __SITE_URL__: JSON.stringify(siteUrl) },
    build: {
      chunkSizeWarningLimit: 1100,
      target: 'es2020',
      sourcemap: true,
    },
  }
})

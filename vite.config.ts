import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const ROUTES = ['/', '/product', '/about', '/privacy', '/terms']
const NL = String.fromCharCode(10)

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
    plugins: [react(), seoFiles(siteUrl)],
    define: { __SITE_URL__: JSON.stringify(siteUrl) },
    build: {
      chunkSizeWarningLimit: 1100,
      target: 'es2020',
      sourcemap: true,
    },
  }
})

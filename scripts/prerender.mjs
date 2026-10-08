// Prerender every public route to static HTML (run after the client + SSR builds).
// Output uses Vercel cleanUrls: dist/product.html is served at /product, 404.html with a 404 status.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = path.resolve('dist')
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const { render } = await import(pathToFileURL(path.resolve('dist-ssr/entry-server.js')).href)

const ROUTES = [
  ['/', 'index.html'],
  ['/product', 'product.html'],
  ['/about', 'about.html'],
  ['/privacy', 'privacy.html'],
  ['/terms', 'terms.html'],
  ['/__not-found__', '404.html', true],
]

for (const [route, file, notFound] of ROUTES) {
  const { html, head } = render(route, !!notFound)
  if (!template.includes('<!--app-head-->') || !template.includes('<!--app-html-->')) throw new Error('template markers missing')
  const page = template.replace('<!--app-head-->', head).replace('<!--app-html-->', html)
  fs.writeFileSync(path.join(dist, file), page)
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length
  console.log(`prerendered ${route.padEnd(15)} → ${file.padEnd(13)} ${(page.length / 1024).toFixed(1)} KB, <h1>×${h1}`)
}
fs.rmSync(path.resolve('dist-ssr'), { recursive: true, force: true })

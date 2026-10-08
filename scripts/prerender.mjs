// Prerender every public route to static HTML (run after the client + SSR builds).
// server.js serves dist/product.html at /product (clean URLs) and 404.html with a 404 status.
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

// Home-page preloader (first full load of / only; in-site navigation never sees it): static
// markup + inline critical CSS so it is on screen from the first paint. Controller: src/loader/loader.ts
const loaderCss = fs
  .readFileSync(path.resolve('src/loader/loader.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .trim()
const logo = fs.readFileSync(path.join(dist, 'img/loader-logo.webp')).toString('base64')
const withLoader = (page) => {
  for (const marker of ['<html lang="en-IN">', '</head>', '<div id="root">']) if (!page.includes(marker)) throw new Error(`loader marker missing: ${marker}`)
  return page
    .replace('<html lang="en-IN">', '<html lang="en-IN" data-loading>')
    .replace('</head>', `<style>${loaderCss}</style><noscript><style>#zap-loader{display:none}html[data-loading],html[data-loading] body{overflow:auto}html[data-loading] .nav,html[data-loading] .hero,html[data-loading] .hero *{animation-play-state:running!important}</style></noscript></head>`)
    .replace('<div id="root">', `<div id="zap-loader" aria-hidden="true"><img src="data:image/webp;base64,${logo}" alt="" width="440" height="80" decoding="sync"></div><div id="root">`)
}

for (const [route, file, notFound] of ROUTES) {
  const { html, head } = render(route, !!notFound)
  if (!template.includes('<!--app-head-->') || !template.includes('<!--app-html-->')) throw new Error('template markers missing')
  let page = template.replace('<!--app-head-->', head).replace('<!--app-html-->', html)
  if (route === '/') page = withLoader(page)
  fs.writeFileSync(path.join(dist, file), page)
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length
  console.log(`prerendered ${route.padEnd(15)} → ${file.padEnd(13)} ${(page.length / 1024).toFixed(1)} KB, <h1>×${h1}`)
}
fs.rmSync(path.resolve('dist-ssr'), { recursive: true, force: true })

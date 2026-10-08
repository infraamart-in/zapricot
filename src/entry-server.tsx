// Build-time prerender entry: renders a route to static HTML (no browser APIs touched).
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App'
import { setServerPath } from './lib/router'
import { buildHead } from './lib/seo'

export function render(path: string, isNotFound = false) {
  setServerPath(path)
  const html = renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return { html, head: buildHead(path, isNotFound) }
}

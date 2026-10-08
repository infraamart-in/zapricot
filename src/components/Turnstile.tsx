import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

// Site key: injected at runtime by server.js as <meta name="zap-turnstile-site-key"> (so it works even
// when the host doesn't expose env vars to the build), else the build-time VITE_ value.
export const TURNSTILE_SITE_KEY: string | undefined =
  (typeof document !== 'undefined' && document.querySelector<HTMLMetaElement>('meta[name="zap-turnstile-site-key"]')?.content) ||
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
  undefined
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<void> | null = null
function loadScript() {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile failed to load'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/**
 * Cloudflare Turnstile (spam protection). Invisible unless Cloudflare needs an interaction.
 * Renders nothing when no site key is configured (local dev without keys).
 */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        id.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          appearance: 'interaction-only',
          action: 'early-access',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        })
      })
      .catch(() => cb.current(null))
    return () => {
      cancelled = true
      if (id.current && window.turnstile) window.turnstile.remove(id.current)
      id.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey && id.current && window.turnstile) {
      window.turnstile.reset(id.current)
      cb.current(null)
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={box} className="turnstile" />
}

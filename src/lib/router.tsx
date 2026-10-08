import { forwardRef, useEffect, useState, type AnchorHTMLAttributes } from 'react'

/** Tiny pushState router — four routes don't need a library. */
export function navigate(to: string) {
  if (to === window.location.pathname) return
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

let serverPath = '/'
/** Prerender sets the route being rendered (there is no window on the server). */
export function setServerPath(p: string) {
  serverPath = p
}

export function usePath() {
  const [path, setPath] = useState(() => (typeof window === 'undefined' ? serverPath : window.location.pathname))
  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return path.replace(/\/+$/, '') || '/'
}

export const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function Link({ href, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(href)
      }}
      {...rest}
    />
  )
})

import { useEffect, useState } from 'react'

export function useMedia(query: string) {
  // false on the first render everywhere (prerender == hydration); real value right after mount
  const [match, setMatch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function usePrefs() {
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const mobile = useMedia('(max-width: 768px)')
  const [webgl, setWebgl] = useState(true) // assume capable for the first render; verified after mount
  useEffect(() => setWebgl(hasWebGL()), [])
  return { reduced, mobile, webgl }
}

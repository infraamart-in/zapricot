import { Component, useEffect, useState, type ReactNode } from 'react'

/** If WebGL fails to start (or the lazy chunk fails to load), render the static fallback instead of a blank screen. */
export class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.info('[scene] WebGL unavailable, showing static fallback:', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Boundary fallback that reports the failure upward (so the page can swap in its 2D version). */
export function ReportFail({ onFail, children = null }: { onFail: () => void; children?: ReactNode }) {
  useEffect(() => onFail(), [onFail])
  return <>{children}</>
}

/** False while the tab is hidden, so render loops can stop entirely. */
export function usePageVisible() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    on()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

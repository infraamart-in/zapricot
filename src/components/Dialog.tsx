import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  labelledBy: string
  /** left side of the header row (e.g. step indicator); the close button is always on the right */
  head?: ReactNode
  className?: string
  children: ReactNode
}

const EXIT_MS = 200

/**
 * Shared modal shell (Early access, Contact): native <dialog> for the top layer, focus trap
 * and Esc; one panel style, backdrop and enter/exit animation. Open state is owned by the
 * parent, so opening one dialog simply closes the other. Focus returns to the opener.
 */
export function Dialog({ open, onClose, labelledBy, head, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null
      setClosing(false)
      d.showModal()
      return
    }
    if (!open && d.open) {
      setClosing(true)
      const t = window.setTimeout(() => {
        d.close()
        setClosing(false)
        // return focus to whatever opened it, unless another dialog has taken over. If the opener
        // has gone (e.g. it lived in the mobile menu, now closed), fall back to the menu toggle / main.
        if (document.querySelector('dialog[open]')) return
        const o = opener.current
        const visible = (el: HTMLElement | null) => !!el && el.isConnected && el.getClientRects().length > 0
        const target = visible(o) ? o : ([...document.querySelectorAll<HTMLElement>('[data-focus-fallback]')].find(visible) ?? document.getElementById('main'))
        target?.focus({ preventScroll: true })
      }, EXIT_MS)
      return () => window.clearTimeout(t)
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${className ?? ''}`}
      data-closing={closing}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <div>{head}</div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

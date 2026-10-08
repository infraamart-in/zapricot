import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Instagram, Mail, MapPin, Phone } from 'lucide-react'
import { CONTACT } from '../config'
import { Dialog } from './Dialog'

const ICON = { size: 18, strokeWidth: 1.5, 'aria-hidden': true } as const

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // older / insecure contexts
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      className="copy-btn"
      data-copied={copied}
      onClick={async () => {
        if (!(await copyText(value))) return
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 2000)
      }}
      aria-label={copied ? 'Email copied' : 'Copy email address'}
    >
      <span className="copy-btn__label" aria-hidden>{copied ? 'Copied' : 'Copy'}</span>
      {copied ? <Check size={13} strokeWidth={2} aria-hidden /> : <Copy size={13} strokeWidth={1.6} aria-hidden />}
      <span className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </button>
  )
}

export function ContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="contact-title"
      className="modal--contact"
      head={
        // initial focus lands on the heading (not the × button), like the form focuses its first field
        <h2 className="pane__title contact__title" id="contact-title" tabIndex={-1} autoFocus>
          Get in touch
        </h2>
      }
    >
      <ul className="contact">
        <li className="contact__row" style={{ ['--i' as string]: 0 }}>
          <span className="contact__icon"><Mail {...ICON} /></span>
          <div className="contact__text">
            <span className="contact__label">Email</span>
            <a className="contact__value" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </div>
          <CopyButton value={CONTACT.email} />
        </li>
        <li className="contact__row" style={{ ['--i' as string]: 1 }}>
          <span className="contact__icon"><Phone {...ICON} /></span>
          <div className="contact__text">
            <span className="contact__label">Phone</span>
            <a className="contact__value" href={CONTACT.phoneHref}>{CONTACT.phone}</a>
          </div>
        </li>
        <li className="contact__row" style={{ ['--i' as string]: 2 }}>
          <span className="contact__icon"><Instagram {...ICON} /></span>
          <div className="contact__text">
            <span className="contact__label">Instagram</span>
            <a className="contact__value" href={CONTACT.instagramHref} target="_blank" rel="noreferrer">
              {CONTACT.instagram}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </li>
        <li className="contact__row" style={{ ['--i' as string]: 3 }}>
          <span className="contact__icon"><MapPin {...ICON} /></span>
          <div className="contact__text">
            <span className="contact__label">Location</span>
            <span className="contact__value">{CONTACT.location}</span>
          </div>
        </li>
      </ul>
    </Dialog>
  )
}

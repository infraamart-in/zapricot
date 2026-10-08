import { useEffect, useRef, useState, type FormEvent } from 'react'
import { JOTFORM } from '../config'
import { CARD_IMAGE_2D } from '../cardSpec'
import { CarCombobox } from './CarCombobox'
import { Dialog } from './Dialog'
import { Turnstile } from './Turnstile'

type Data = { name: string; email: string; phone: string; city: string; car: string; consent: boolean }
type Errors = Partial<Record<keyof Data, string>>
type Status = 'idle' | 'sending' | 'error' | 'rate'

const EMPTY: Data = { name: '', email: '', phone: '', city: '', car: '', consent: false }
const LIMITS = { name: 80, city: 60, car: 60 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Normalise to a 10-digit Indian mobile, or null. Accepts spaces, dashes, +91 / 0 prefixes. */
function indianMobile(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

function validate(step: number, v: Data): Errors {
  const e: Errors = {}
  if (step === 0) {
    if (v.name.trim().length < 2) e.name = 'Tell us your name.'
    else if (v.name.trim().length > LIMITS.name) e.name = `Keep it under ${LIMITS.name} characters.`
    if (!EMAIL_RE.test(v.email.trim())) e.email = 'That email looks off.'
    if (!indianMobile(v.phone)) e.phone = 'Enter a 10-digit Indian mobile number.'
  } else if (step === 1) {
    if (v.city.trim().length < 2) e.city = 'Which city are you in?'
    if (v.car.trim().length < 2) e.car = 'Pick or type your car.'
    if (!v.consent) e.consent = 'Please tick the box so we can contact you.'
  }
  return e
}

/** Everything goes through our own endpoint; Jotform is only ever contacted server-side. */
async function submit(v: Data, extra: { company: string; elapsedMs: number; turnstileToken: string | null }): Promise<'ok' | 'rate' | 'error'> {
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: v.name.trim(),
        email: v.email.trim(),
        phone: v.phone,
        city: v.city.trim(),
        car: v.car.trim(),
        consent: v.consent,
        company: extra.company,
        elapsedMs: extra.elapsedMs,
        turnstileToken: extra.turnstileToken ?? undefined,
      }),
    })
    if (res.ok) return 'ok'
    return res.status === 429 ? 'rate' : 'error'
  } catch {
    return 'error'
  }
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field" data-invalid={!!error}>
      <label className="field__label" htmlFor={id}>{label}</label>
      {children}
      <p className="field__error" id={`${id}-err`} role={error ? 'alert' : undefined}>{error ?? ''}</p>
    </div>
  )
}

export function RegisterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<Data>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<Status>('idle')
  const firstInput = useRef<HTMLInputElement>(null)
  const cityInput = useRef<HTMLInputElement>(null)
  const openedAt = useRef(0)
  const [honeypot, setHoneypot] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)

  useEffect(() => {
    if (open) openedAt.current = Date.now()
  }, [open])

  const requestClose = onClose

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => (step === 0 ? firstInput.current : step === 1 ? cityInput.current : null)?.focus({ preventScroll: true }), 380)
    return () => window.clearTimeout(t)
  }, [step, open])

  const set = (k: Exclude<keyof Data, 'consent'>) => (v: string) => {
    setData((d) => ({ ...d, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(step, data)
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (step === 0) return setStep(1)
    setStatus('sending')
    const result = await submit(data, { company: honeypot, elapsedMs: Date.now() - openedAt.current, turnstileToken: token })
    if (result === 'ok') {
      setStatus('idle')
      setStep(2)
    } else {
      setStatus(result)
      setTurnstileReset((n) => n + 1) // tokens are single-use
    }
  }

  const inert = (i: number) => (i === step ? {} : { inert: '' as unknown as boolean, 'aria-hidden': true })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="reg-title"
      head={
        <div className="steps" aria-label={`Step ${step + 1} of 3`}>
          <span className="steps__count">
            <span className="steps__now">{String(step + 1).padStart(2, '0')}</span> / 03
          </span>
          <span className="steps__bar" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} data-on={i <= step} />)}
          </span>
        </div>
      }
    >
        <form className="modal__form" onSubmit={onSubmit} noValidate>
          <div className="track" style={{ ['--step' as string]: step }}>
            <fieldset className="pane" {...inert(0)}>
              <legend className="pane__title" id={step === 0 ? 'reg-title' : undefined}>Get on the list.</legend>
              <p className="pane__sub">Hyderabad first. Takes ten seconds.</p>
              <Field id="name" label="Name" error={errors.name}>
                <input ref={firstInput} id="name" className="field__input" autoComplete="name" maxLength={LIMITS.name} placeholder="Your name" value={data.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={!!errors.name || undefined} aria-describedby="name-err" />
              </Field>
              <Field id="email" label="Email" error={errors.email}>
                <input id="email" className="field__input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={data.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={!!errors.email || undefined} aria-describedby="email-err" />
              </Field>
              <Field id="phone" label="Mobile" error={errors.phone}>
                <div className="field__affix">
                  <span aria-hidden>+91</span>
                  <input id="phone" className="field__input" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={data.phone} onChange={(e) => set('phone')(e.target.value)} aria-invalid={!!errors.phone || undefined} aria-describedby="phone-err" />
                </div>
              </Field>
            </fieldset>

            <fieldset className="pane" {...inert(1)}>
              <legend className="pane__title" id={step === 1 ? 'reg-title' : undefined}>Where, and what?</legend>
              <p className="pane__sub">So we know which chargers to switch on first.</p>
              <Field id="city" label="City" error={errors.city}>
                <input ref={cityInput} id="city" className="field__input" autoComplete="address-level2" maxLength={LIMITS.city} placeholder="Hyderabad" value={data.city} onChange={(e) => set('city')(e.target.value)} aria-invalid={!!errors.city || undefined} aria-describedby="city-err" />
              </Field>
              <Field id="car" label="Car model" error={errors.car}>
                <CarCombobox value={data.car} onChange={set('car')} invalid={!!errors.car} describedBy="car-err" />
              </Field>
              <div className="consent" data-invalid={!!errors.consent}>
                <input
                  id="consent"
                  type="checkbox"
                  checked={data.consent}
                  onChange={(e) => {
                    const consent = e.target.checked
                    setData((d) => ({ ...d, consent }))
                    if (errors.consent) setErrors((x) => ({ ...x, consent: undefined }))
                  }}
                  aria-invalid={!!errors.consent || undefined}
                  aria-describedby="consent-err"
                  required
                />
                <label htmlFor="consent">
                  I agree to zapricot contacting me about early access, as described in the{' '}
                  <a href="/privacy" target="_blank" rel="noopener">
                    Privacy Policy
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  .
                </label>
              </div>
              <p className="field__error" id="consent-err" role={errors.consent ? 'alert' : undefined}>{errors.consent ?? ''}</p>
              {/* honeypot: invisible to people, irresistible to bots */}
              <div className="hp" aria-hidden="true">
                <label htmlFor="company">Company</label>
                <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>
              {open && <Turnstile onToken={setToken} resetKey={turnstileReset} />}
              {status === 'error' && (
                <p className="form-error" role="alert">
                  That didn&rsquo;t go through. Try again, or use the <a href={JOTFORM.hostedUrl} target="_blank" rel="noreferrer">hosted form</a>.
                </p>
              )}
              {status === 'rate' && (
                <p className="form-error" role="alert">
                  Too many attempts. Please try again in a few minutes.
                </p>
              )}
            </fieldset>

            <div className="pane pane--done" {...inert(2)} aria-live="polite">
              <div className="done__card" data-show={step === 2}>
                <span className="done__glow" aria-hidden />
                <img src="/cards/gold-2d.webp" alt="" width={CARD_IMAGE_2D.width} height={CARD_IMAGE_2D.height} />
              </div>
              <h2 className="pane__title done__title" id={step === 2 ? 'reg-title' : undefined}>You're in.</h2>
              <p className="pane__sub">We'll ping you.</p>
            </div>
          </div>

          <footer className="modal__foot" data-step={step}>
            {step === 1 && (
              <button type="button" className="link-btn" onClick={() => setStep(0)}>
                Back
              </button>
            )}
            {step < 2 ? (
              <button type="submit" className="btn btn--sm" disabled={status === 'sending'} data-loading={status === 'sending'}>
                <span className="btn__label">{step === 0 ? 'Continue' : 'Join the list'}</span>
                <span className="btn__spinner" aria-hidden />
                {status === 'sending' && <span className="sr-only">Sending…</span>}
              </button>
            ) : (
              <button type="button" className="btn btn--sm" onClick={requestClose}>
                Done
              </button>
            )}
          </footer>
          {step === 1 && <p className="modal__note">You can unsubscribe or ask us to delete your data anytime.</p>}
          {step < 2 && (
            <p className="modal__fallback">
              Trouble here? <a href={JOTFORM.hostedUrl} target="_blank" rel="noreferrer">Use the hosted form</a>
            </p>
          )}
        </form>
    </Dialog>
  )
}

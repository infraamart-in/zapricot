import { useId, useMemo, useState } from 'react'

export const CAR_MODELS = [
  'Tata Nexon EV',
  'Tata Punch EV',
  'Mahindra XEV 9e',
  'MG ZS EV',
  'MG Windsor',
  'BYD Atto 3',
  'Hyundai Creta EV',
  'Other',
]

type Props = {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  describedBy?: string
}

/** Free-text input with a filtered suggestion list (ARIA 1.2 combobox pattern). */
export function CarCombobox({ value, onChange, invalid, describedBy }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const options = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return CAR_MODELS
    const hits = CAR_MODELS.filter((m) => m.toLowerCase().includes(q))
    return hits.length ? hits : ['Other']
  }, [value])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div className="combo">
      <input
        id="car"
        className="field__input"
        type="text"
        role="combobox"
        autoComplete="off"
        maxLength={60}
        placeholder="Start typing — e.g. Nexon"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(options.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && open && active >= 0) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            e.preventDefault()
            setOpen(false)
          }
        }}
      />
      <ul id={listId} role="listbox" className="combo__list" data-open={open && options.length > 0} aria-label="Suggested car models">
        {options.map((m, i) => (
          <li
            key={m}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className="combo__opt"
            onMouseDown={(e) => {
              e.preventDefault()
              pick(m)
            }}
            onMouseEnter={() => setActive(i)}
          >
            {m}
          </li>
        ))}
      </ul>
    </div>
  )
}

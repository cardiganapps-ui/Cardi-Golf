/**
 * A controlled number field that lets the organizer clear it while typing
 * (an empty box stays empty instead of snapping to 0) and commits on every
 * keystroke. Whole numbers only.
 */
import { useEffect, useState } from 'react'

export function NumberInput({ value, onChange, min = 0, max, label, prefix, suffix, className = '' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; prefix?: string; suffix?: string; className?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText((cur) => (cur === '' && value === 0 ? cur : Number(cur) === value ? cur : String(value)))
  }, [value])
  return (
    <span className={`numField ${className}`}>
      {prefix && <span className="numField__affix">{prefix}</span>}
      <input
        className="input input--num"
        inputMode="numeric"
        aria-label={label}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '')
          setText(raw)
          let n = raw === '' ? 0 : Number(raw)
          if (max !== undefined) n = Math.min(max, n)
          onChange(Math.max(min, n))
        }}
        onBlur={() => setText(String(value))}
      />
      {suffix && <span className="numField__affix">{suffix}</span>}
    </span>
  )
}

/**
 * The numeric inputs. They let you type.
 *
 * The rule that makes them work: while the field has the caret, the text on
 * screen belongs to the person typing and nothing may rewrite it. An outside
 * value is only accepted when the field is idle, so neither a parent that
 * clamps or rounds nor a realtime reload can pull digits out from under the
 * caret. What the parent receives is always in range; what the typist sees is
 * always what they typed, until they leave and it settles to the truth.
 *
 * `type="text"` on purpose. A number input hands us a value we cannot hold
 * half-typed — for "71." it reports "" — and coercing that back per keystroke
 * is what made every number in this app stubborn.
 *
 * `NumberField` is for a value that must exist. `OptionalNumberField` is for
 * one that may be blank, where blank carries meaning ("assumed", "no cap").
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Shared {
  /** Lowest value the parent may receive. A negative min also allows a leading "−". */
  min?: number
  max?: number
  /** Decimals allowed while typing. 0 (the default) means whole numbers. */
  decimals?: number
  /** Accessible name, when no visible <label> wraps or points at the field. */
  label?: string
  /** Shown before the box, e.g. "$". */
  prefix?: ReactNode
  /** Shown after the box, e.g. "%" or "por día". */
  suffix?: ReactNode
  id?: string
  disabled?: boolean
  placeholder?: string
  /** Extra classes on the wrapper. */
  className?: string
  /** Extra classes on the input itself. */
  inputClassName?: string
  /** Take focus when the sheet this lives in opens. See `Sheet` in ui.tsx. */
  autoFocusInSheet?: boolean
}

/** How a committed value is written back into the box. */
function format(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return ''
  return decimals > 0 ? String(Number(value.toFixed(decimals))) : String(Math.round(value))
}

/**
 * Keep only what could still become the number the person is aiming at: digits,
 * one leading minus when negatives are allowed, and one decimal separator when
 * decimals are. A comma types as a point, because both keypads offer one.
 *
 * In a whole-number field a separator is dropped rather than ending the number,
 * so pasting a formatted amount ("1,200") into a money box gives 1200. Typing
 * "12.5" into one is not a case worth optimising for.
 */
export function keepNumeric(raw: string, decimals: number, negative: boolean): string {
  let out = ''
  let seenPoint = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (negative && ch === '-' && out === '') out += ch
    else if (decimals > 0 && (ch === '.' || ch === ',') && !seenPoint) {
      out += '.'
      seenPoint = true
    }
  }
  if (seenPoint) {
    const point = out.indexOf('.')
    out = out.slice(0, point + 1) + out.slice(point + 1, point + 1 + decimals)
  }
  return out
}

/** Text that is on its way to being a number, and so must not be committed yet. */
function inTransit(text: string): boolean {
  return text === '' || text === '-' || text.endsWith('.')
}

/**
 * The box's own text, synced from the value only while the box is idle.
 * `editing` is the guard the old field was missing.
 */
function useNumericText(value: number | null, decimals: number) {
  const [text, setText] = useState(() => (value == null ? '' : format(value, decimals)))
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setText(value == null ? '' : format(value, decimals))
  }, [value, decimals])
  return { text, setText, editing }
}

/** The shared markup, so both fields look and behave identically. */
function NumericBox({
  text,
  onText,
  onFocus,
  onBlur,
  decimals = 0,
  negative,
  label,
  prefix,
  suffix,
  id,
  disabled,
  placeholder,
  className = '',
  inputClassName = '',
  autoFocusInSheet,
}: Shared & {
  text: string
  onText: (next: string) => void
  onFocus: () => void
  onBlur: () => void
  negative: boolean
}) {
  return (
    <span className={`numField ${className}`.trim()}>
      {prefix != null && <span className="numField__affix">{prefix}</span>}
      <input
        id={id}
        className={`input input--num ${inputClassName}`.trim()}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        value={text}
        data-autofocus={autoFocusInSheet ? '' : undefined}
        onFocus={onFocus}
        onChange={(e) => onText(keepNumeric(e.target.value, decimals, negative))}
        onBlur={onBlur}
      />
      {suffix != null && <span className="numField__affix">{suffix}</span>}
    </span>
  )
}

export interface NumberFieldProps extends Shared {
  value: number
  onChange: (v: number) => void
}

/** A number that must have a value. An emptied box settles back to the last one. */
export function NumberField({ value, onChange, min = 0, max, decimals = 0, ...rest }: NumberFieldProps) {
  const { text, setText, editing } = useNumericText(value, decimals)
  return (
    <NumericBox
      {...rest}
      text={text}
      decimals={decimals}
      negative={min < 0}
      onFocus={() => {
        editing.current = true
      }}
      onText={(next) => {
        setText(next)
        if (inTransit(next)) return
        const n = Number(next)
        if (Number.isFinite(n)) onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n)))
      }}
      onBlur={() => {
        editing.current = false
        setText(format(value, decimals))
      }}
    />
  )
}

export interface OptionalNumberFieldProps extends Shared {
  value: number | null
  onChange: (v: number | null) => void
}

/** A number where blank means something: "assumed", "not set", "no cap". */
export function OptionalNumberField({ value, onChange, min = 0, max, decimals = 0, ...rest }: OptionalNumberFieldProps) {
  const { text, setText, editing } = useNumericText(value, decimals)
  return (
    <NumericBox
      {...rest}
      text={text}
      decimals={decimals}
      negative={min < 0}
      onFocus={() => {
        editing.current = true
      }}
      onText={(next) => {
        setText(next)
        if (next === '') {
          onChange(null)
          return
        }
        // "-" and "12." are on their way somewhere: hold them, commit nothing.
        if (inTransit(next)) return
        const n = Number(next)
        if (Number.isFinite(n)) onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n)))
      }}
      onBlur={() => {
        editing.current = false
        setText(value == null ? '' : format(value, decimals))
      }}
    />
  )
}

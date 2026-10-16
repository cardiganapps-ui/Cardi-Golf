/**
 * Design primitives for direction A ("La tarjeta"): buttons, fields,
 * figures, stepper, segmented, tab bar, leaderboard row, pencil notation,
 * scorecard grid, empty state, live status, event name, wordmark, plate.
 * Every visual value comes from tokens.css through primitives.module.css.
 * Behavioural components (sheet, toasts, loading, avatar) live in ./ui.
 */
import {
  cloneElement,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { blankFigure, t, type RowSpeech } from '../i18n/es-MX'
import { IconMinus, IconPlus, IconRefresh } from './icons'
import { lockups, wordmark as wm } from '../design/logoMark.json'
import { assetUrl } from '../lib/assetUrl'
import s from './primitives.module.css'
import { TournamentLogo } from './TournamentLogo'
import { markFor, type MarkKind } from './notation'
import { haptic } from '../lib/haptics'
import { formatMoney, formatSignedMoney } from '../lib/money'
import { useCurrency } from './currency'

// ---- Pressed ----
/*
 * MOT-12: a control whose tap starts a heavy render (a board row opens the player's sheet, a segment swaps a view)
 * shows it is pressed from the finger's first touch. Chrome on Android applies `:active` only once it is sure the
 * touch is not a scroll (its 100 ms tap timeout), so a quick tap got it in the same task as the click, and nothing
 * was painted until the sheet's render had held the screen for a fifth of a second: it read as a missed tap.
 * `data-pressed` goes on at pointerdown and paints on the next frame; it stays through the click (it goes on the
 * frame after the finger lifts, so the render the click starts keeps it on screen) and goes at once when the touch
 * turns into a scroll, or a drag the page does not scroll for (En vivo's pull to refresh) moves it past a tap's
 * slop. A mouse has `:active` at once, and no capture to bring its pointerup back here: left to CSS.
 */
const pressedAt = new WeakMap<HTMLElement, { x: number; y: number }>()
const TAP_SLOP = 10
function pressDown(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType === 'mouse' || !e.isPrimary || (e.currentTarget as HTMLButtonElement).disabled) return
  e.currentTarget.dataset.pressed = ''
  pressedAt.set(e.currentTarget, { x: e.clientX, y: e.clientY })
}
function pressMove(e: ReactPointerEvent<HTMLElement>) {
  const at = pressedAt.get(e.currentTarget)
  if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > TAP_SLOP) pressCancel(e)
}
function pressUp(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget
  pressedAt.delete(el)
  if (el.dataset.pressed === undefined) return
  requestAnimationFrame(() => delete el.dataset.pressed)
}
function pressCancel(e: ReactPointerEvent<HTMLElement>) {
  pressedAt.delete(e.currentTarget)
  delete e.currentTarget.dataset.pressed
}
/** Spread on a control that opens or swaps something heavy: its pressed state shows from the first touch. */
const PRESS = { onPointerDown: pressDown, onPointerMove: pressMove, onPointerUp: pressUp, onPointerCancel: pressCancel } as const

// ---- Buttons ----
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  pressed,
  focus,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'sm'; block?: boolean; pressed?: boolean; focus?: boolean }) {
  const v = { primary: s.btnPrimary, secondary: s.btnSecondary, quiet: s.btnQuiet, danger: s.btnDanger }[variant]
  return <button type="button" className={`${s.btn} ${v} ${size === 'sm' ? s.btnSm : ''} ${block ? s.btnBlock : ''} ${pressed ? s.pressed : ''} ${focus ? s.focus : ''} ${className}`} {...rest} />
}

// ---- Fields ----
/**
 * A label and its control, with a hint or an error under it (A11Y-24). The label holds only its words and the
 * control, so the control is named by the label alone; the hint and the error describe it (`aria-describedby`)
 * and an error marks it invalid (`aria-invalid`) and is said as it appears. They used to sit inside the label and
 * became part of the field's name, and nothing was ever marked invalid. Anything that is not one field (a row of
 * choices, a segmented switch, a list) is a group named by the label: a label around it handed a tap on its words
 * to the first button in it.
 */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  const id = useId()
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const notes = (
    <>
      {hintId && (
        <span id={hintId} className={s.help}>
          {hint}
        </span>
      )}
      {errorId && (
        <span id={errorId} className={s.errorText} role="alert">
          {error}
        </span>
      )}
    </>
  )
  if (!isLabelable(children)) {
    return (
      <div className={s.field} role="group" aria-labelledby={`${id}-label`} aria-describedby={hintId ?? errorId}>
        <span id={`${id}-label`} className={s.fieldLabel}>
          {label}
        </span>
        {children}
        {notes}
      </div>
    )
  }
  const own = children.props as { 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' }
  const control = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': [own['aria-describedby'], hintId ?? errorId].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : own['aria-invalid'],
  })
  return (
    <div className={s.field}>
      <label className={s.fieldControl}>
        <span className={s.fieldLabel}>{label}</span>
        {control}
      </label>
      {notes}
    </div>
  )
}
/** One field a label names: a native input, select or textarea, or a component that renders one (`labelable`). */
function isLabelable(node: ReactNode): node is ReactElement {
  if (!isValidElement(node)) return false
  return typeof node.type === 'string' ? ['input', 'select', 'textarea'].includes(node.type) : !!(node.type as { labelable?: boolean }).labelable
}
export function Input({ error, code, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean; code?: boolean }) {
  return <input className={`${s.input} ${error ? s.inputError : ''} ${code ? s.codeInput : ''} ${className}`} {...rest} />
}
Input.labelable = true

/** «SI» on the card, «índice de golpe» spoken (A11Y-22): a Spanish voice reads the letters as «sí». */
export function SiAbbr() {
  return (
    <>
      <span aria-hidden="true">{t.player.si}</span>
      <span className="sr-only">{t.player.siSpoken}</span>
    </>
  )
}

// ---- Figures ----
export type Tone = 'under' | 'over' | 'even'
/** A tabular figure. `tone` colors it by golf convention. */
export function Figure({ children, tone, className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`${s.fig} ${tone ? s[tone] : ''} ${className}`}>{children}</span>
}
/** An amount in the tournament's currency (`useCurrency`, ARCH-06), or the one given (a profile's nets carry theirs). */
export function Money({ amount, signed, currency }: { amount: number; signed?: boolean; currency?: string }) {
  const here = useCurrency()
  const cur = currency ?? here
  const text = signed ? formatSignedMoney(amount, cur) : formatMoney(amount, cur)
  return <span className={`${s.money} ${signed && amount < 0 ? s.moneyNeg : ''}`}>{text}</span>
}

// ---- Stepper ----
/**
 * `quiet`: the value is not a live region. A screen that announces the change
 * itself, with whose score it is, sets it (the Tarjeta); otherwise a hole change
 * reads out eight bare figures.
 */
export function Stepper({ value, par, onChange, min = 1, max = 15, size = 'md', label, disabled, quiet }: { value: number; par?: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'md' | 'lg'; label: string; disabled?: boolean; quiet?: boolean }) {
  // Each tick is felt, where the phone can vibrate (MOT-10).
  const step = (v: number) => {
    haptic('tick')
    onChange(v)
  }
  return (
    <div className={`${s.stepper} ${size === 'lg' ? s.stepperLg : ''} ${disabled ? s.stepperOff : ''}`} role="group" aria-label={label}>
      <button type="button" className={s.stepBtn} aria-label={`${label}: ${t.common.stepDown}`} disabled={disabled || value <= min} onClick={() => step(value - 1)}>
        <IconMinus />
      </button>
      <span className={`${s.fig} ${s.stepValue} ${par !== undefined && value === par ? s.stepPar : ''}`} aria-live={quiet ? undefined : 'polite'}>
        {value}
      </span>
      <button type="button" className={s.stepBtn} aria-label={`${label}: ${t.common.stepUp}`} disabled={disabled || value >= max} onClick={() => step(value + 1)}>
        <IconPlus />
      </button>
    </div>
  )
}

// ---- Segmented ----
/** A view toggle is a radio group; only a real set of panels (Juegos) is a tablist. */
/**
 * A choice of a few (A11Y-17): a radio group, or with `tabs` the tab list of a panel (`panelId`, the panel's id,
 * which the caller renders with role="tabpanel"). Either way one Tab stop, the chosen option, and the arrow keys,
 * Home and End move among the options and choose as they go, as the ARIA patterns ask.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  tabs,
  label,
  panelId,
  disabled,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  tabs?: boolean
  label?: string
  panelId?: string
  disabled?: boolean
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.max(0, options.findIndex((o) => o.value === value))
  function onKey(e: ReactKeyboardEvent<HTMLButtonElement>, i: number) {
    const last = options.length - 1
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (to === null) return
    e.preventDefault()
    refs.current[to]?.focus()
    onChange(options[to]!.value)
  }
  return (
    <div className={s.segmented} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} aria-disabled={disabled || undefined}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role={tabs ? 'tab' : 'radio'}
          id={tabs && panelId ? `${panelId}-tab-${o.value}` : undefined}
          aria-controls={tabs ? panelId : undefined}
          aria-selected={tabs ? o.value === value : undefined}
          aria-checked={tabs ? undefined : o.value === value}
          tabIndex={i === current ? 0 : -1}
          disabled={disabled}
          className={`${s.segBtn} ${o.value === value ? s.segOn : ''}`}
          {...PRESS}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---- Tab bar ----
export function TabBar({ items }: { items: Array<{ icon: ReactNode; label: string; active?: boolean }> }) {
  return (
    <nav className={s.tabbar} aria-label={t.common.sections}>
      {items.map((it) => (
        <button key={it.label} type="button" className={`${s.tab} ${it.active ? s.tabOn : ''}`} aria-current={it.active ? 'page' : undefined}>
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ---- Leaderboard ----
export interface LeaderRowProps {
  pos: string
  name: string
  sub?: ReactNode
  today?: string
  /** Colour of the day's figure, for a figure that has a side (a match won or lost). */
  todayTone?: Tone
  /** How a screen reader says the day's figure, when the text alone does not («ganó 8&6»). */
  todaySpoken?: string
  thru?: string
  figure: string
  tone?: Tone
  mine?: boolean
  /** Calcutta owners' initials, shown after the sub line. */
  owners?: string
  /** The tournament's honoree: a small ring after the name. */
  honoree?: boolean
  /** Places moved since this phone last showed the board (MOT-06): up is positive, shown «▲3» under the position. */
  movedBy?: number
  /**
   * The day's figure and the figure as this phone last showed them (MOT-18): one that changed since washes as the
   * board opens. A figure that changes while the board is on screen washes whatever these say.
   */
  seenToday?: string
  seenFigure?: string
  /** Which reading of the board the figures are (En vivo's Puntos or Gross): a new reading is not a change. */
  reading?: string
  dense?: boolean
  /** What else a screen reader hears for the row (A11Y-11): «tú», category, the figure's unit, money, owners. */
  speech?: RowSpeech
  onClick?: () => void
}

/**
 * MOT-18: a board figure that changes washes once, the accent's tint fading out over `--dur-wash` (under reduced
 * motion it keeps a dot instead, until the board goes); one that changed since this phone last showed the board
 * (`seen`) washes as the board opens. A live score that moved nobody used to swap its figures in one frame and
 * leave no trace. It is done on the element, before the frame that shows the new figure is painted, so it costs
 * no render: a board that changes renders only the rows that did (PERF-09). `data-wash` flips between two names of
 * the same animation, so each change starts it again; React never writes the attribute, so a render keeps it.
 * There is no count: a hole moves a total by a few points, which a count would show in two or three frames.
 */
function useWash(ref: RefObject<HTMLElement | null>, value: string, seen: string | undefined, reading: string | undefined) {
  const last = useRef<{ value: string; seen: string | undefined; reading: string | undefined } | null>(null)
  useLayoutEffect(() => {
    const prev = last.current
    last.current = { value, seen, reading }
    const el = ref.current
    if (!el || !value || blankFigure(value)) return
    // Puntos to Gross and back: the same board read another way, not a change.
    if (prev && prev.reading !== reading) return
    // The board's first showing, or a new look at it: what changed since this phone last showed it.
    const before = !prev || prev.seen !== seen ? seen : prev.value
    if (before === undefined || before === value) return
    el.dataset.wash = el.dataset.wash === 'a' ? 'b' : 'a'
  }, [ref, value, seen, reading])
}
export function BoardHead({ figureLabel, dense }: { figureLabel: string; dense?: boolean }) {
  return (
    <div className={`${s.boardHead} ${dense ? s.leaderRowDense : ''}`} aria-hidden="true">
      <span />
      <span />
      <span>{t.live.today}</span>
      <span>{t.live.thru}</span>
      <span>{figureLabel}</span>
    </div>
  )
}
export function LeaderRow({
  pos,
  name,
  sub,
  today,
  todayTone,
  todaySpoken,
  thru,
  figure,
  tone = 'even',
  mine,
  owners,
  honoree,
  movedBy,
  seenToday,
  seenFigure,
  reading,
  dense,
  speech,
  onClick,
}: LeaderRowProps) {
  const subLine = [sub, owners].filter(Boolean)
  const label = t.live.rowLabel(pos, name, figure, todaySpoken ?? today, thru, { me: mine, movedBy, ...speech, todaySpoken: !!todaySpoken })
  const todayRef = useRef<HTMLSpanElement>(null)
  const figureRef = useRef<HTMLSpanElement>(null)
  useWash(todayRef, today ?? '', seenToday, reading)
  useWash(figureRef, figure, seenFigure, reading)
  return (
    <button type="button" className={`${s.leaderRow} ${dense ? s.leaderRowDense : ''} ${mine ? s.mine : ''}`} {...PRESS} onClick={onClick} aria-label={label}>
      <span className={`${s.fig} ${s.pos} ${pos === '1' ? s.posTop : ''}`}>
        {pos}
        {/* Since the last look, with how far (MOT-06): a 6 px triangle for half a second said neither. */}
        {movedBy ? (
          <span className={`${s.moved} ${movedBy > 0 ? s.movedUp : s.movedDown}`} aria-hidden="true">
            {Math.abs(movedBy)}
          </span>
        ) : null}
      </span>
      <span className={s.name}>
        <span className={s.nameMain}>
          {name}
          {honoree && <span className={s.honoreeDot} aria-hidden="true" />}
        </span>
        {subLine.length > 0 && !dense && (
          <span className={s.nameSub}>
            {sub}
            {owners && <span className={s.owners}>{owners}</span>}
          </span>
        )}
      </span>
      {/*
        * No pencil ring here, though DESIGN_DIRECTION.md asks for one: this
        * column holds the day's TOTAL, and the ring means "this figure is a
        * birdie". Circling 25 points says something false, and on a real
        * field almost every round contains a birdie, so ten of twelve rows
        * were ringed and the mark stopped meaning anything. It stays on the
        * Tarjeta, where the figure it rings is a hole score.
        */}
      <span ref={todayRef} className={`${s.fig} ${s.today} ${todayTone && todayTone !== 'even' ? s[todayTone] : ''}`}>
        {today ?? ''}
      </span>
      <span className={`${s.fig} ${s.thru}`}>{thru ?? ''}</span>
      <span ref={figureRef} className={`${s.fig} ${s.figure} ${s[tone]}`}>
        {figure}
      </span>
    </button>
  )
}
export function Board({ children }: { children: ReactNode }) {
  return <div className={s.board}>{children}</div>
}

// ---- Pencil notation ----
export function ScoreMark({ value, kind }: { value: string | number; kind: MarkKind }) {
  const stroke = kind === 'eagle' || kind === 'birdie' ? 'var(--under)' : 'var(--over)'
  return (
    // A11Y-10: one image named with the figure and what it is («7, doble bogey o peor»); a label on a plain span
    // replaced the figure for some readers and was dropped by others.
    <span className={`${s.mark} ${s.fig} ${kind === 'pickup' ? s.markPickup : ''}`} role="img" aria-label={t.card.markSpoken(value, kind)}>
      <svg className={s.markSvg} viewBox="0 0 30 30" style={{ stroke }} aria-hidden="true">
        {(kind === 'birdie' || kind === 'eagle') && <circle cx="15" cy="15" r="12" />}
        {kind === 'eagle' && <circle cx="15" cy="15" r="9" />}
        {(kind === 'bogey' || kind === 'double') && <rect x="3" y="3" width="24" height="24" rx="1" />}
        {kind === 'double' && <rect x="6.5" y="6.5" width="17" height="17" rx="1" />}
      </svg>
      <span className={kind === 'birdie' || kind === 'eagle' ? s.under : undefined} aria-hidden="true">
        {value}
      </span>
    </span>
  )
}

// ---- Scorecard grid ----
export interface GridHole {
  n: number
  par: number
  si: number
  gross: number | null
  pickedUp?: boolean
  /**
   * The gross strokes the hole counts in an event that counts strokes: a
   * pick-up capped at net double bogey. Absent, a pick-up has no strokes, so
   * the nine and the round show no gross total (it would leave the hole out).
   */
  counted?: number | null
  pts?: number
  putts?: number | null
}
export function ScorecardGrid({ holes, playerLabel, showPoints, showPutts, onHole }: { holes: GridHole[]; playerLabel: string; showPoints?: boolean; showPutts?: boolean; onHole?: (n: number) => void }) {
  // Two stacked nines: each fits a phone screen without scrolling, and the totals are labelled.
  const front = holes.filter((h) => h.n <= 9)
  const back = holes.filter((h) => h.n > 9)
  const sum = (hs: GridHole[], f: (h: GridHole) => number | null | undefined) => hs.reduce((a, h) => a + (f(h) ?? 0), 0)
  // A hole's strokes toward the gross total; a pick-up counts only where the event says what it costs.
  const strokes = (h: GridHole) => (h.counted !== undefined ? h.counted : h.pickedUp ? null : h.gross)
  const grossTotal = (hs: GridHole[]) => (hs.every((h) => strokes(h) != null) ? sum(hs, strokes) : null)
  const mark = (h: GridHole) =>
    h.gross != null || h.pickedUp ? (
      onHole ? (
        <button type="button" className={s.gridCellBtn} onClick={() => onHole(h.n)} aria-label={t.player.holeSpoken(h.n, h.pickedUp ? null : h.gross, markFor(h.gross, h.par, h.pickedUp), showPoints ? (h.pts ?? null) : null)}>
          <ScoreMark value={h.pickedUp ? 'L' : h.gross!} kind={markFor(h.gross, h.par, h.pickedUp)} />
        </button>
      ) : (
        <ScoreMark value={h.pickedUp ? 'L' : h.gross!} kind={markFor(h.gross, h.par, h.pickedUp)} />
      )
    ) : (
      ''
    )
  const nine = (hs: GridHole[], label: string) => (
    <table className={s.grid}>
      <thead>
        <tr>
          <th>{t.player.hole}</th>
          {hs.map((h) => (
            <th key={h.n}>{h.n}</th>
          ))}
          <th className={s.gridTotal}>{label}</th>
        </tr>
      </thead>
      <tbody>
        <tr className={s.gridMeta}>
          <th scope="row">{t.player.par}</th>
          {hs.map((h) => (
            <td key={h.n}>{h.par}</td>
          ))}
          <td className={s.gridTotal}>{sum(hs, (h) => h.par)}</td>
        </tr>
        <tr className={s.gridMeta}>
          <th scope="row">
            <SiAbbr />
          </th>
          {hs.map((h) => (
            <td key={h.n}>{h.si}</td>
          ))}
          <td className={s.gridTotal} />
        </tr>
        <tr>
          <th scope="row">{playerLabel}</th>
          {hs.map((h) => (
            <td key={h.n}>{mark(h)}</td>
          ))}
          <td className={`${s.gridTotal} ${s.fig}`}>{grossTotal(hs) ?? ''}</td>
        </tr>
        {showPutts && (
          <tr className={s.gridMeta}>
            <th scope="row">{t.player.putts}</th>
            {hs.map((h) => (
              <td key={h.n}>{h.putts ?? ''}</td>
            ))}
            <td className={s.gridTotal}>{sum(hs, (h) => h.putts)}</td>
          </tr>
        )}
        {showPoints && (
          <tr className={s.gridMeta}>
            <th scope="row">{t.player.pts}</th>
            {hs.map((h) => (
              <td key={h.n}>{h.pts ?? ''}</td>
            ))}
            <td className={s.gridTotal}>{sum(hs, (h) => h.pts)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
  return (
    <div className={s.gridWrap}>
      {nine(front, back.length ? t.card.front : t.common.total)}
      {back.length > 0 && nine(back, t.card.back)}
      {back.length > 0 && (
        <div className={s.gridTotals}>
          <span>
            {t.common.total}: {grossTotal(holes) ?? '–'} {t.player.gross.toLowerCase()}
          </span>
          {showPutts && (
            <span>
              {sum(holes, (h) => h.putts)} {t.player.putts.toLowerCase()}
            </span>
          )}
          {showPoints && (
            <span>
              {sum(holes, (h) => h.pts)} {t.player.pts.toLowerCase()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Empty, live ----
/**
 * An empty state used to be one sentence between two hairlines, which is what
 * a new account sees on five blocks of Mi Polo at once. It now carries the
 * app's own mark: an empty pencil ring, which is exactly what a scorecard
 * box looks like before anyone writes in it.
 */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <svg className={s.emptyMark} viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="12" />
        <line x1="10" y1="15" x2="20" y2="15" />
      </svg>
      <span className={s.emptyTitle}>{title}</span>
      {body && <span className={s.help}>{body}</span>}
      {action}
    </div>
  )
}
/**
 * A state in a word or two, with its dot (on while live). Given `onRefresh` it is a button, «Actualizar»
 * (PWA-15): `label` is its whole name, the words shown first. `busy` while the refresh is under way: a tap
 * then does nothing.
 */
export function LiveStatus({ text, live = true, onRefresh, busy, label }: { text: string; live?: boolean; onRefresh?: () => void; busy?: boolean; label?: string }) {
  const inner = (
    <>
      <span className={`${s.liveDot} ${live ? '' : s.liveDotOff}`} aria-hidden="true" />
      <span>{text}</span>
    </>
  )
  if (!onRefresh) return <span className={s.live}>{inner}</span>
  return (
    <button type="button" className={`${s.live} ${s.liveButton}`} aria-label={label} aria-busy={busy || undefined} onClick={() => !busy && onRefresh()}>
      {inner}
      <IconRefresh size={16} className={`${s.liveIcon} ${busy ? s.liveIconBusy : ''}`} />
    </button>
  )
}

// ---- Event name, wordmark, plate ----
/** `heading`: the name is the screen's h1 (Entrar, A11Y-13); its class sets every property the h1 would change. */
export function EventName({ name, tagline, logoUrl, small, heading }: { name: string; tagline?: string; logoUrl?: string | null; small?: boolean; heading?: boolean }) {
  const Name = heading ? 'h1' : 'div'
  return (
    <div className={s.event}>
      {logoUrl && <TournamentLogo url={logoUrl} className={s.eventLogo} />}
      <div>
        <Name className={`${s.eventName} ${small ? s.eventNameSm : ''}`}>{name}</Name>
        {!small && <div className={s.eventRule} aria-hidden="true" />}
        {tagline && !small && <div className={s.eventTagline}>{tagline}</div>}
      </div>
    </div>
  )
}
/**
 * The Polo symbol exactly as the approved sheet draws it
 * (design/brand/polo-logo-sheet.jpg): the sheet's own pencil, lifted off its
 * paper by scripts/brand/extract-logo.py. Each tone uses the copy the sheet
 * shows for it: graphite from the Horizontal Lockup (the sheet's color and
 * one-color versions are the same line), gold from the TV board study.
 * `size` is the image's height.
 */
export type LogoTone = 'color' | 'mono' | 'board'
const lockupFor = (tone: LogoTone) => (tone === 'board' ? lockups.board : lockups.standard)
export function LogoMark({ size = 24, tone = 'color' }: { size?: number; tone?: LogoTone }) {
  const l = lockupFor(tone)
  return (
    <img
      className={s.logoMark}
      src={assetUrl(l.image)}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={Math.round(size * l.aspect)}
      height={size}
    />
  )
}
// Each lockup as the sheet draws it, in em of the wordmark: the symbol's height,
// its drop below the baseline and its gap to the P (less the P's own side
// bearing), plus the Archivo settings fitted to the sheet's lettering.
function lockupStyle(tone: LogoTone, size: number): CSSProperties {
  const l = lockupFor(tone)
  return {
    fontSize: size,
    '--wm-weight': String(wm.weight),
    '--wm-width': `${wm.width}%`,
    '--wm-tracking': `${wm.letterSpacing}em`,
    '--mark-height': `${(l.markHeight * wm.capHeight).toFixed(4)}em`,
    '--mark-drop': `${(-l.belowBaseline * wm.capHeight).toFixed(4)}em`,
    '--mark-gap': `${(l.gap * wm.capHeight - wm.pSideBearing).toFixed(4)}em`,
  } as CSSProperties
}
/** The lockup as on the sheet: the symbol, then "Polo". `mark={false}` gives the bare wordmark. */
export function Wordmark({ size = 24, tone = 'color', mark = true }: { size?: number; tone?: LogoTone; mark?: boolean }) {
  return (
    <span
      className={`${s.wordmark} ${tone === 'board' ? s.wordmarkBoard : ''}`}
      style={lockupStyle(tone, size)}
      role="img"
      aria-label={t.app.name}
    >
      {mark && <img className={s.wordmarkMark} src={lockupFor(tone).image} alt="" draggable={false} />}
      <span aria-hidden="true">{t.app.name}</span>
    </span>
  )
}
export function Plate({ value, leader }: { value: string; leader?: boolean }) {
  return <span className={`${s.plate} ${leader ? s.plateLeader : ''}`}>{value}</span>
}

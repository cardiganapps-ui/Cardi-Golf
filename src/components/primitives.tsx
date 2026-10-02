/**
 * Design primitives for direction A ("La tarjeta"): buttons, fields,
 * figures, stepper, segmented, tab bar, leaderboard row, pencil notation,
 * scorecard grid, empty state, live status, event name, wordmark, plate.
 * Every visual value comes from tokens.css through primitives.module.css.
 * Behavioural components (sheet, toasts, loading, avatar) live in ./ui.
 */
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { IconMinus, IconPlus } from './icons'
import { lockups, wordmark as wm } from '../design/logoMark.json'
import s from './primitives.module.css'

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
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {hint && !error && <span className={s.help}>{hint}</span>}
      {error && <span className={s.errorText}>{error}</span>}
    </label>
  )
}
export function Input({ error, code, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean; code?: boolean }) {
  return <input className={`${s.input} ${error ? s.inputError : ''} ${code ? s.codeInput : ''} ${className}`} {...rest} />
}

// ---- Figures ----
export type Tone = 'under' | 'over' | 'even'
/** A tabular figure. `tone` colors it by golf convention. */
export function Figure({ children, tone, className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`${s.fig} ${tone ? s[tone] : ''} ${className}`}>{children}</span>
}
/** To-par text: −2, E, +3 (true minus). */
export function toPar(n: number): { text: string; tone: Tone } {
  if (n === 0) return { text: 'E', tone: 'even' }
  return n < 0 ? { text: `−${Math.abs(n)}`, tone: 'under' } : { text: `+${n}`, tone: 'over' }
}
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
export function Money({ amount, signed }: { amount: number; signed?: boolean }) {
  const text = signed && amount !== 0 ? `${amount < 0 ? '−' : '+'}${mxn.format(Math.abs(amount))}` : mxn.format(amount)
  return <span className={`${s.money} ${signed && amount < 0 ? s.moneyNeg : ''}`}>{text}</span>
}

// ---- Stepper ----
/**
 * `quiet`: the value is not a live region. A screen that announces the change
 * itself, with whose score it is, sets it (the Tarjeta); otherwise a hole change
 * reads out eight bare figures.
 */
export function Stepper({ value, par, onChange, min = 1, max = 15, size = 'md', label, disabled, quiet }: { value: number; par?: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'md' | 'lg'; label: string; disabled?: boolean; quiet?: boolean }) {
  return (
    <div className={`${s.stepper} ${size === 'lg' ? s.stepperLg : ''} ${disabled ? s.stepperOff : ''}`} role="group" aria-label={label}>
      <button type="button" className={s.stepBtn} aria-label={`${label}: ${t.common.stepDown}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <IconMinus />
      </button>
      <span className={`${s.fig} ${s.stepValue} ${par !== undefined && value === par ? s.stepPar : ''}`} aria-live={quiet ? undefined : 'polite'}>
        {value}
      </span>
      <button type="button" className={s.stepBtn} aria-label={`${label}: ${t.common.stepUp}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <IconPlus />
      </button>
    </div>
  )
}

// ---- Segmented ----
/** A view toggle is a radio group; only a real set of panels (Juegos) is a tablist. */
export function Segmented<T extends string>({ value, options, onChange, tabs, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; tabs?: boolean; label?: string }) {
  return (
    <div className={s.segmented} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role={tabs ? 'tab' : 'radio'} aria-selected={tabs ? o.value === value : undefined} aria-checked={tabs ? undefined : o.value === value} className={`${s.segBtn} ${o.value === value ? s.segOn : ''}`} onClick={() => onChange(o.value)}>
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
  moved?: 'up' | 'down' | null
  dense?: boolean
  onClick?: () => void
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
export function LeaderRow({ pos, name, sub, today, todayTone, todaySpoken, thru, figure, tone = 'even', mine, owners, honoree, moved, dense, onClick }: LeaderRowProps) {
  const subLine = [sub, owners].filter(Boolean)
  return (
    <button type="button" className={`${s.leaderRow} ${dense ? s.leaderRowDense : ''} ${mine ? s.mine : ''}`} onClick={onClick} aria-label={t.live.rowLabel(pos, name, figure, todaySpoken ?? today, thru)}>
      {moved && <span className={`${s.moved} ${moved === 'up' ? s.movedUp : s.movedDown}`} aria-hidden="true" />}
      <span className={`${s.fig} ${s.pos} ${pos === '1' ? s.posTop : ''}`}>{pos}</span>
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
      <span className={`${s.fig} ${s.today} ${todayTone && todayTone !== 'even' ? s[todayTone] : ''}`}>{today ?? ''}</span>
      <span className={`${s.fig} ${s.thru}`}>{thru ?? ''}</span>
      <span className={`${s.fig} ${s.figure} ${s[tone]}`}>{figure}</span>
    </button>
  )
}
export function Board({ children }: { children: ReactNode }) {
  return <div className={s.board}>{children}</div>
}

// ---- Pencil notation ----
export type MarkKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'pickup'
export function markFor(gross: number | null, par: number, pickedUp = false): MarkKind {
  if (pickedUp || gross == null) return 'pickup'
  const d = gross - par
  if (d <= -2) return 'eagle'
  if (d === -1) return 'birdie'
  if (d === 0) return 'par'
  if (d === 1) return 'bogey'
  return 'double'
}
export function ScoreMark({ value, kind }: { value: string | number; kind: MarkKind }) {
  const stroke = kind === 'eagle' || kind === 'birdie' ? 'var(--under)' : 'var(--over)'
  return (
    <span className={`${s.mark} ${s.fig} ${kind === 'pickup' ? s.markPickup : ''}`} aria-label={t.card.markName[kind] ?? kind}>
      <svg className={s.markSvg} viewBox="0 0 30 30" style={{ stroke }} aria-hidden="true">
        {(kind === 'birdie' || kind === 'eagle') && <circle cx="15" cy="15" r="12" />}
        {kind === 'eagle' && <circle cx="15" cy="15" r="9" />}
        {(kind === 'bogey' || kind === 'double') && <rect x="3" y="3" width="24" height="24" rx="1" />}
        {kind === 'double' && <rect x="6.5" y="6.5" width="17" height="17" rx="1" />}
      </svg>
      <span className={kind === 'birdie' || kind === 'eagle' ? s.under : undefined}>{value}</span>
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
  pts?: number
  putts?: number | null
}
export function ScorecardGrid({ holes, playerLabel, showPoints, showPutts, onHole }: { holes: GridHole[]; playerLabel: string; showPoints?: boolean; showPutts?: boolean; onHole?: (n: number) => void }) {
  // Two stacked nines: each fits a phone screen without scrolling, and the totals are labelled.
  const front = holes.filter((h) => h.n <= 9)
  const back = holes.filter((h) => h.n > 9)
  const sum = (hs: GridHole[], f: (h: GridHole) => number | null | undefined) => hs.reduce((a, h) => a + (f(h) ?? 0), 0)
  const played = (hs: GridHole[]) => hs.every((h) => h.gross != null || h.pickedUp)
  const mark = (h: GridHole) =>
    h.gross != null || h.pickedUp ? (
      onHole ? (
        <button type="button" className={s.gridCellBtn} onClick={() => onHole(h.n)} aria-label={`${t.player.hole} ${h.n}`}>
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
          <td>{t.player.par}</td>
          {hs.map((h) => (
            <td key={h.n}>{h.par}</td>
          ))}
          <td className={s.gridTotal}>{sum(hs, (h) => h.par)}</td>
        </tr>
        <tr className={s.gridMeta}>
          <td>{t.player.si}</td>
          {hs.map((h) => (
            <td key={h.n}>{h.si}</td>
          ))}
          <td className={s.gridTotal} />
        </tr>
        <tr>
          <td>{playerLabel}</td>
          {hs.map((h) => (
            <td key={h.n}>{mark(h)}</td>
          ))}
          <td className={`${s.gridTotal} ${s.fig}`}>{played(hs) ? sum(hs, (h) => h.gross) : ''}</td>
        </tr>
        {showPutts && (
          <tr className={s.gridMeta}>
            <td>{t.player.putts}</td>
            {hs.map((h) => (
              <td key={h.n}>{h.putts ?? ''}</td>
            ))}
            <td className={s.gridTotal}>{sum(hs, (h) => h.putts)}</td>
          </tr>
        )}
        {showPoints && (
          <tr className={s.gridMeta}>
            <td>{t.player.pts}</td>
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
            {t.common.total}: {played(holes) ? sum(holes, (h) => h.gross) : '–'} {t.player.gross.toLowerCase()}
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
export function LiveStatus({ text, live = true }: { text: string; live?: boolean }) {
  return (
    <span className={s.live}>
      <span className={`${s.liveDot} ${live ? '' : s.liveDotOff}`} aria-hidden="true" />
      {text}
    </span>
  )
}

// ---- Event name, wordmark, plate ----
export function EventName({ name, tagline, logoUrl, small }: { name: string; tagline?: string; logoUrl?: string | null; small?: boolean }) {
  return (
    <div className={s.event}>
      {logoUrl && <img src={logoUrl} alt="" className={s.eventLogo} />}
      <div>
        <div className={`${s.eventName} ${small ? s.eventNameSm : ''}`}>{name}</div>
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
      src={l.image}
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

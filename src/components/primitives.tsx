/**
 * Design primitives for direction A ("La tarjeta"): buttons, fields,
 * figures, stepper, segmented, tab bar, leaderboard row, pencil notation,
 * scorecard grid, empty state, live status, event name, wordmark, plate.
 * Every visual value comes from tokens.css through primitives.module.css.
 * Behavioural components (sheet, toasts, loading, avatar) live in ./ui.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { IconMinus, IconPlus } from './icons'
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
export function Stepper({ value, par, onChange, min = 1, max = 15, size = 'md', label, disabled }: { value: number; par?: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'md' | 'lg'; label: string; disabled?: boolean }) {
  return (
    <div className={`${s.stepper} ${size === 'lg' ? s.stepperLg : ''} ${disabled ? s.stepperOff : ''}`} role="group" aria-label={label}>
      <button type="button" className={s.stepBtn} aria-label={`${label}: menos`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <IconMinus />
      </button>
      <span className={`${s.fig} ${s.stepValue} ${par !== undefined && value === par ? s.stepPar : ''}`} aria-live="polite">
        {value}
      </span>
      <button type="button" className={s.stepBtn} aria-label={`${label}: más`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <IconPlus />
      </button>
    </div>
  )
}

// ---- Segmented ----
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`${s.segBtn} ${o.value === value ? s.segOn : ''}`} onClick={() => onChange(o.value)}>
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
export function LeaderRow({ pos, name, sub, today, thru, figure, tone = 'even', mine, owners, honoree, moved, dense, onClick }: LeaderRowProps) {
  const subLine = [sub, owners].filter(Boolean)
  return (
    <button type="button" className={`${s.leaderRow} ${dense ? s.leaderRowDense : ''} ${mine ? s.mine : ''}`} onClick={onClick}>
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
      <span className={`${s.fig} ${s.today}`}>{today ?? ''}</span>
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
    <span className={`${s.mark} ${s.fig} ${kind === 'pickup' ? s.markPickup : ''}`} aria-label={kind}>
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
  const front = holes.filter((h) => h.n <= 9)
  const back = holes.filter((h) => h.n > 9)
  const sum = (hs: GridHole[], f: (h: GridHole) => number | null | undefined) => hs.reduce((a, h) => a + (f(h) ?? 0), 0)
  const played = (hs: GridHole[]) => hs.every((h) => h.gross != null || h.pickedUp)
  const cols = (hs: GridHole[], label: string) => (
    <>
      {hs.map((h) => (
        <th key={h.n}>{h.n}</th>
      ))}
      <th className={s.gridTotal}>{label}</th>
    </>
  )
  return (
    <div className={s.gridWrap}>
      <table className={s.grid}>
        <thead>
          <tr>
            <th>Hoyo</th>
            {cols(front, 'Ida')}
            {back.length > 0 && cols(back, 'Vta')}
            {back.length > 0 && <th className={s.gridTotal}>Tot</th>}
          </tr>
        </thead>
        <tbody>
          <tr className={s.gridMeta}>
            <td>Par</td>
            {front.map((h) => (
              <td key={h.n}>{h.par}</td>
            ))}
            <td className={s.gridTotal}>{sum(front, (h) => h.par)}</td>
            {back.length > 0 && back.map((h) => <td key={h.n}>{h.par}</td>)}
            {back.length > 0 && <td className={s.gridTotal}>{sum(back, (h) => h.par)}</td>}
            {back.length > 0 && <td className={s.gridTotal}>{sum(holes, (h) => h.par)}</td>}
          </tr>
          <tr className={s.gridMeta}>
            <td>SI</td>
            {front.map((h) => (
              <td key={h.n}>{h.si}</td>
            ))}
            <td className={s.gridTotal} />
            {back.length > 0 && back.map((h) => <td key={h.n}>{h.si}</td>)}
            {back.length > 0 && <td className={s.gridTotal} />}
            {back.length > 0 && <td className={s.gridTotal} />}
          </tr>
          <tr>
            <td>{playerLabel}</td>
            {front.map((h) => (
              <td key={h.n}>{h.gross != null || h.pickedUp ? (onHole ? <button type="button" className={s.gridCellBtn} onClick={() => onHole(h.n)} aria-label={`${h.n}`}><ScoreMark value={h.pickedUp ? 'L' : h.gross!} kind={markFor(h.gross, h.par, h.pickedUp)} /></button> : <ScoreMark value={h.pickedUp ? 'L' : h.gross!} kind={markFor(h.gross, h.par, h.pickedUp)} />) : ''}</td>
            ))}
            <td className={`${s.gridTotal} ${s.fig}`}>{played(front) ? sum(front, (h) => h.gross) : ''}</td>
            {back.length > 0 && back.map((h) => <td key={h.n}>{h.gross != null || h.pickedUp ? (onHole ? <button type="button" className={s.gridCellBtn} onClick={() => onHole(h.n)} aria-label={`${h.n}`}><ScoreMark value={h.pickedUp ? 'L' : h.gross!} kind={markFor(h.gross, h.par, h.pickedUp)} /></button> : <ScoreMark value={h.pickedUp ? 'L' : h.gross!} kind={markFor(h.gross, h.par, h.pickedUp)} />) : ''}</td>)}
            {back.length > 0 && <td className={`${s.gridTotal} ${s.fig}`}>{played(back) ? sum(back, (h) => h.gross) : ''}</td>}
            {back.length > 0 && <td className={`${s.gridTotal} ${s.fig}`}>{played(holes) ? sum(holes, (h) => h.gross) : ''}</td>}
          </tr>
          {showPutts && (
            <tr className={s.gridMeta}>
              <td>Putts</td>
              {front.map((h) => (
                <td key={h.n}>{h.putts ?? ''}</td>
              ))}
              <td className={s.gridTotal}>{sum(front, (h) => h.putts)}</td>
              {back.length > 0 && back.map((h) => <td key={h.n}>{h.putts ?? ''}</td>)}
              {back.length > 0 && <td className={s.gridTotal}>{sum(back, (h) => h.putts)}</td>}
              {back.length > 0 && <td className={s.gridTotal}>{sum(holes, (h) => h.putts)}</td>}
            </tr>
          )}
          {showPoints && (
            <tr className={s.gridMeta}>
              <td>Pts</td>
              {front.map((h) => (
                <td key={h.n}>{h.pts ?? ''}</td>
              ))}
              <td className={s.gridTotal}>{sum(front, (h) => h.pts)}</td>
              {back.length > 0 && back.map((h) => <td key={h.n}>{h.pts ?? ''}</td>)}
              {back.length > 0 && <td className={s.gridTotal}>{sum(back, (h) => h.pts)}</td>}
              {back.length > 0 && <td className={s.gridTotal}>{sum(holes, (h) => h.pts)}</td>}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ---- Empty, live ----
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyTitle}>{title}</span>
      <span className={s.help}>{body}</span>
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
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className={s.wordmark} style={{ fontSize: size }} aria-label="Cardi-Golf">
      Cardi-
      <span className={s.wordmarkG}>
        <span className={s.wordmarkRing} aria-hidden="true" />G
      </span>
      olf
    </span>
  )
}
export function Plate({ value, leader }: { value: string; leader?: boolean }) {
  return <span className={`${s.plate} ${leader ? s.plateLeader : ''}`}>{value}</span>
}

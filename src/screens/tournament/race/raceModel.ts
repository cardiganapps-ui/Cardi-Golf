/**
 * The race chart's model (§9.7; PERF-04, VIS-21, A11Y-20, MOT-21): pure, no
 * React, no DOM. It takes the engine's cumulative figures as they are (each
 * entrant's `race`, one value per hole played, in order) and lays them out:
 * which entrants stand out in colour and which are grey context, the scales,
 * one path per entrant, the hole and day axis, the labels at the cursor and
 * the sentence a screen reader hears. Display only: every number shown is a
 * value the engine produced, never one recomputed.
 *
 * The axis is the event's days as they are (1..N rounds of 9 or 18 holes),
 * never 36 holes assumed. Every line starts from 0 before the first hole, the
 * figure everybody holds at the first tee, so the race fans out from one point.
 */

export interface RaceEntrant {
  id: string
  label: string
  /** The cumulative figure after each hole played (the engine's `race`), in play order. */
  values: readonly number[]
}

/** One day on the axis: its number and how many holes it has. */
export interface RaceDay {
  number: number
  holes: number
}

export type HighlightRole = 'leader' | 'me' | 'honoree' | 'picked' | 'all'

export interface Highlight {
  id: string
  /** Why it stands out: the first ones on the board, this phone's player, the honoree, the one picked. */
  roles: HighlightRole[]
  /** Its colour slot, 1..SLOTS (`--race-<n>`). Slot 1, the accent, is this phone's player when he is drawn. */
  slot: number
}

/** The colours a race draws at once (`--race-1..6`, validated together on the card stock). */
export const SLOTS = 6
/** With this many entrants or fewer every line is in colour; past it, a few stand out and the rest are grey. */
export const ALL_IN_COLOUR = SLOTS
/** How many of the board's first stand out by default in a large field. */
export const LEADERS = 3

/**
 * Who stands out. `order` is the board's order (the engine's ranking), so the
 * leaders are its first. In a field of six or fewer everyone is drawn in
 * colour. Past that: the first three, this phone's own, the honoree and one
 * picked from the list, at most six.
 *
 * A colour belongs to its entrant, never to a rank (a re-sort or a new pick
 * repaints nobody already drawn): in a small field by the entrant's place in
 * `stable` (the field as listed, not ranked), in a large one slot 1 is always
 * this phone's player, and the others take the remaining slots in the order
 * leaders, honoree, picked.
 */
export function highlights(
  order: readonly string[],
  stable: readonly string[],
  who: { me?: string | null; honoree?: string | null; picked?: string | null },
): Highlight[] {
  const ids = new Set(order)
  const me = who.me && ids.has(who.me) ? who.me : null
  const honoree = who.honoree && ids.has(who.honoree) ? who.honoree : null
  const picked = who.picked && ids.has(who.picked) ? who.picked : null
  const roles = new Map<string, HighlightRole[]>()
  const add = (id: string | null, role: HighlightRole) => {
    if (!id) return
    const r = roles.get(id) ?? []
    if (!r.includes(role)) r.push(role)
    roles.set(id, r)
  }
  if (order.length <= ALL_IN_COLOUR) {
    const place = stable.filter((id) => ids.has(id))
    for (const id of order) if (!place.includes(id)) place.push(id)
    add(me, 'me')
    add(honoree, 'honoree')
    // Slot 1 is the accent: this phone's own, when he is in the race; the rest by their place in the field.
    let next = me ? 2 : 1
    return place.map((id) => {
      const r = roles.get(id) ?? []
      return { id, roles: r.length > 0 ? r : ['all'], slot: id === me ? 1 : next++ }
    })
  }
  for (const id of order.slice(0, LEADERS)) add(id, 'leader')
  add(me, 'me')
  add(honoree, 'honoree')
  add(picked, 'picked')
  const out: Highlight[] = []
  let next = 2
  if (me) out.push({ id: me, roles: roles.get(me)!, slot: 1 })
  for (const id of [...order.slice(0, LEADERS), honoree, picked]) {
    if (!id || out.some((h) => h.id === id)) continue
    out.push({ id, roles: roles.get(id)!, slot: next++ })
  }
  return out
}

/** The figure an entrant holds after `k` holes of the axis (0 is the first tee): his last one when he has played fewer. */
export function valueAt(values: readonly number[], k: number): number {
  if (k <= 0 || values.length === 0) return 0
  return values[Math.min(k, values.length) - 1]!
}

/** The axis's length in holes: the days', or more when a race runs past them (data the days don't explain). */
export function axisLength(days: readonly RaceDay[], entrants: readonly RaceEntrant[]): number {
  const planned = days.reduce((a, d) => a + d.holes, 0)
  return Math.max(1, planned, ...entrants.map((e) => e.values.length))
}

/** Hole `k` of the axis (1-based) as its day and hole: «hoyo 5 del día 2». Past the days, the last day's count goes on. */
export function holeOf(days: readonly RaceDay[], k: number): { day: number; hole: number } {
  let left = k
  for (const d of days) {
    if (left <= d.holes) return { day: d.number, hole: left }
    left -= d.holes
  }
  const last = days.at(-1)
  return last ? { day: last.number, hole: last.holes + left } : { day: 1, hole: k }
}

/** Round, readable tick values covering [lo, hi]: steps of 1, 2 or 5 times a power of ten, the one nearest to `target` of them. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0]
  if (hi < lo) [lo, hi] = [hi, lo]
  if (hi === lo) return [lo]
  const raw = (hi - lo) / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  // The nearest step on a log scale: 0 to 91 is marked every 20 (five marks), not every 50 (two).
  const step = [1, 2, 5, 10]
    .map((m) => m * pow)
    .reduce((a, b) => (Math.abs(Math.log(b / raw)) < Math.abs(Math.log(a / raw)) ? b : a))
  // Whole figures only: a race of points or strokes has no half point to mark.
  const s = Math.max(1, Math.round(step))
  const out: number[] = []
  for (let v = Math.floor(lo / s) * s; v <= Math.ceil(hi / s) * s + 1e-9; v += s) out.push(v)
  return out
}

export interface RaceLayoutInput {
  entrants: readonly RaceEntrant[]
  days: readonly RaceDay[]
  /** Strokes against par: fewer is better, so the axis runs the other way and the leader is on top. */
  lowerIsBetter: boolean
  width: number
  height: number
  /** Room for the labels at the end of the lines. */
  labelWidth: number
  /** Room for the figure axis's labels. */
  axisWidth: number
}

export interface XTick {
  /** Position on the axis, in holes from the first tee. */
  at: number
  x: number
  label: string
}
export interface DayBand {
  day: number
  /** From its first tee to its last hole, in px. */
  x0: number
  x1: number
}

export interface RaceLayout {
  n: number
  plot: { left: number; right: number; top: number; bottom: number }
  yTicks: Array<{ value: number; y: number }>
  xTicks: XTick[]
  bands: DayBand[]
  /** One path per entrant, keyed by id, from the first tee to his last hole played. */
  paths: Record<string, string>
  x: (k: number) => number
  y: (v: number) => number
}

const r1 = (v: number) => Math.round(v * 10) / 10

/** Scales, axes and every entrant's path for one size of the chart. */
export function layoutRace({
  entrants,
  days,
  lowerIsBetter,
  width,
  height,
  labelWidth,
  axisWidth,
}: RaceLayoutInput): RaceLayout {
  const n = axisLength(days, entrants)
  const plot = {
    left: axisWidth,
    right: Math.max(axisWidth + 40, width - labelWidth),
    top: 10,
    bottom: Math.max(60, height - 34),
  }
  let lo = 0
  let hi = 0
  for (const e of entrants)
    for (const v of e.values) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  // The scale spans the figures themselves (and 0, the first tee), so the lines use the whole height; the round ticks inside it are marked.
  const ticks = niceTicks(lo, hi)
  const t0 = lo
  const t1 = hi > lo ? hi : lo + 1
  const span = t1 - t0
  const x = (k: number) => plot.left + (Math.max(0, Math.min(n, k)) / n) * (plot.right - plot.left)
  // More is better on top; under strokes fewer is, so the scale turns over.
  const y = (v: number) =>
    lowerIsBetter
      ? plot.top + ((v - t0) / span) * (plot.bottom - plot.top)
      : plot.bottom - ((v - t0) / span) * (plot.bottom - plot.top)
  const paths: Record<string, string> = {}
  for (const e of entrants) {
    let d = `M${r1(x(0))} ${r1(y(0))}`
    e.values.forEach((v, i) => {
      d += `L${r1(x(i + 1))} ${r1(y(v))}`
    })
    paths[e.id] = d
  }
  // The days: a band each, its holes marked at the turn and the last green when there is room.
  const bands: DayBand[] = []
  const xTicks: XTick[] = []
  let start = 0
  for (const d of days) {
    const x0 = x(start)
    const x1 = x(start + d.holes)
    bands.push({ day: d.number, x0, x1 })
    const marks = x1 - x0 >= 48 ? (d.holes > 9 ? [9, d.holes] : [d.holes]) : []
    for (const h of marks) xTicks.push({ at: start + h, x: x(start + h), label: String(h) })
    start += d.holes
  }
  return {
    n,
    plot,
    yTicks: ticks.filter((v) => v >= t0 && v <= t1).map((value) => ({ value, y: y(value) })),
    xTicks,
    bands,
    paths,
    x,
    y,
  }
}

/** Where a figure reads on a line `t` holes from the first tee (fractional, between two holes): the straight segment's. */
export function pointAt(
  layout: Pick<RaceLayout, 'x' | 'y'>,
  values: readonly number[],
  t: number,
): { x: number; y: number } {
  const last = values.length
  const at = Math.max(0, Math.min(t, last))
  const k = Math.floor(at)
  const f = at - k
  const a = valueAt(values, k)
  const b = valueAt(values, Math.min(last, k + 1))
  return { x: layout.x(at), y: layout.y(a + (b - a) * f) }
}

/**
 * The labels beside the lines that stand out, at the cursor: each at its
 * figure's height, pushed apart so no two overlap (`gap` px between centres),
 * and kept inside the plot's height.
 */
export function placeLabels(
  items: ReadonlyArray<{ id: string; y: number }>,
  top: number,
  bottom: number,
  gap = 14,
): Record<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
  const ys = sorted.map((i) => i.y)
  if (ys.length > 0) ys[0] = Math.max(ys[0]!, top)
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + gap)
  // Too low for the plot: slide the last ones up, and every one above them that they would now touch.
  const overflow = (ys.at(-1) ?? bottom) - bottom
  if (overflow > 0) {
    ys[ys.length - 1] = bottom
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i]!, ys[i + 1]! - gap)
  }
  if ((ys[0] ?? top) < top) {
    // A crowd taller than the plot: spread it evenly over the whole height.
    const step = sorted.length > 1 ? (bottom - top) / (sorted.length - 1) : 0
    ys.forEach((_, i) => (ys[i] = top + i * step))
  }
  const out: Record<string, number> = {}
  sorted.forEach((it, i) => (out[it.id] = ys[i]!))
  return out
}

/**
 * The places at hole `k` (carried forward for whoever has played fewer):
 * 1 is the best figure, a tie shares the place. Under strokes fewer is better.
 */
export function placesAt(entrants: readonly RaceEntrant[], k: number, lowerIsBetter: boolean): Record<string, number> {
  const vals = entrants.map((e) => ({ id: e.id, v: valueAt(e.values, k) }))
  const out: Record<string, number> = {}
  for (const a of vals) out[a.id] = 1 + vals.filter((b) => (lowerIsBetter ? b.v < a.v : b.v > a.v)).length
  return out
}

export interface RaceSummary {
  /** The ones in front at the end of the race, with their figure. */
  leaders: string[]
  value: number
  holes: number
  /** When the one in front (alone) took the lead for good: hole `k` of the axis, as day and hole. Null when he led from the first hole, or when the lead is shared. */
  tookLead: { day: number; hole: number } | null
  /** He led alone after every hole. */
  wireToWire: boolean
}

/** What the race says in a sentence: who is in front, with what, and since when. */
export function summarize(
  entrants: readonly RaceEntrant[],
  days: readonly RaceDay[],
  lowerIsBetter: boolean,
): RaceSummary | null {
  const holes = Math.max(0, ...entrants.map((e) => e.values.length))
  if (entrants.length === 0 || holes === 0) return null
  const final = placesAt(entrants, holes, lowerIsBetter)
  const leaders = entrants.filter((e) => final[e.id] === 1).map((e) => e.id)
  const value = valueAt(entrants.find((e) => e.id === leaders[0])!.values, holes)
  let tookLead: RaceSummary['tookLead'] = null
  let wireToWire = false
  if (leaders.length === 1) {
    const id = leaders[0]!
    // The last hole he did not lead alone: the one after it is when the lead became his for good.
    let lastNot = 0
    for (let k = 1; k <= holes; k++) {
      const p = placesAt(entrants, k, lowerIsBetter)
      const alone = p[id] === 1 && entrants.every((e) => e.id === id || p[e.id]! > 1)
      if (!alone) lastNot = k
    }
    if (lastNot > 0) tookLead = holeOf(days, lastNot + 1)
    else wireToWire = holes > 1
  }
  return { leaders, value, holes, tookLead, wireToWire }
}

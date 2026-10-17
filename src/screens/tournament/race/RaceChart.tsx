/**
 * The race chart of Estadísticas (§9.7): hand-drawn SVG, no chart library
 * (PERF-04: recharts and its tree were 98% of a 368 kB chunk for this one
 * chart). Legible from 4 entrants to 60 (VIS-21): up to six lines in colour,
 * each named beside its line, the rest of a large field as grey context, and
 * one more picked from a list (kept per race in this tab).
 *
 * The replay (MOT-21) draws every path once and never paints them again: a
 * card-stock cover over the part of the plot not reached yet (carrying its
 * own copy of the grid) and the heads of the coloured lines move by CSS
 * transforms set straight on the elements on each animation frame, which the
 * compositor moves without a repaint, and React renders nothing per frame
 * (only the hole readout, once a hole). Under reduced motion there is no
 * replay (MOT-15): the race shows whole, and the bar jumps to any hole.
 *
 * For a screen reader (A11Y-20) the drawing is one image named by a sentence
 * (who is in front, with what, since when), the bar says its hole, the
 * readout lists the coloured lines' places and figures there, and «Ver como
 * tabla» is the whole race, hole by hole.
 */
import { useReducedMotionConfig } from 'motion/react'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { t } from '../../../i18n/es-MX'
import { Button, Field } from '../../../components/primitives'
import { IconPause, IconPlay } from '../../../components/icons'
import { ALL_IN_COLOUR, axisLength, highlights, holeOf, layoutRace, placeLabels, placesAt, pointAt, summarize, valueAt, type Highlight, type RaceDay, type RaceEntrant, type RaceLayout } from './raceModel'
import styles from './RaceChart.module.css'

const R = t.stats.raceChart

export interface RaceChartProps {
  /** The heading's words: the figure's name and the table's. */
  title: string
  /** In the board's order (its ranking): the first ones are the leaders. */
  entrants: RaceEntrant[]
  /** The field as listed (not ranked): a small field's colours follow it, so a re-sort repaints nobody. */
  stable: readonly string[]
  days: readonly RaceDay[]
  /** Strokes against par: fewer is better and the axis turns over. */
  strokes: boolean
  /** A figure as the screen writes it: «72», «−11», «E». */
  format: (v: number) => string
  pairs: boolean
  me?: string | null
  honoree?: string | null
  /** The honoree's label from the settings («El novio»), for his tag. */
  honoreeLabel: string
  /** Where this race's pick is kept in the tab (sessionStorage). */
  pickKey: string
  /** The sentence above the chart: what the figure counts. */
  hint: string
}

const HEIGHT = 280
const AXIS = 30
/** How long the replay of one hole takes, and the bounds of the whole replay. */
const MS_PER_HOLE = 170
/** How far right of the line ends the cover starts, past a round cap. */
const REVEAL_PAD = 2

/** The part of the drawing the cover slides in: the plot and the lines' widths around it. */
function coverWindow(layout: RaceLayout) {
  const { plot } = layout
  return { left: plot.left - 3, top: plot.top - 3, width: plot.right - plot.left + 6, height: plot.bottom - plot.top + 5 }
}
const MIN_MS = 2500
const MAX_MS = 8000

function readPick(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
function writePick(key: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(key, id)
    else sessionStorage.removeItem(key)
  } catch {
    // A tab that keeps nothing still picks; the choice lasts until the screen goes.
  }
}

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s)

export function RaceChart({ title, entrants, stable, days, strokes, format, pairs, me, honoree, honoreeLabel, pickKey, hint }: RaceChartProps) {
  const reduce = useReducedMotionConfig() ?? false
  const id = useId()
  const [width, setWidth] = useState(343)
  const boxRef = useRef<HTMLDivElement>(null)
  // Each race keeps its own pick (the screen mounts one chart per race).
  const [picked, setPicked] = useState<string | null>(() => readPick(pickKey))
  /** The hole the race is read at; null is its end, which follows the race as holes arrive. */
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [table, setTable] = useState(false)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const w = Math.round(el.clientWidth)
      if (w > 0) setWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const order = useMemo(() => entrants.map((e) => e.id), [entrants])
  const byId = useMemo(() => new Map(entrants.map((e) => [e.id, e])), [entrants])
  const lit = useMemo(() => highlights(order, stable, { me, honoree, picked }), [order, stable, me, honoree, picked])
  const grey = entrants.length > ALL_IN_COLOUR
  const n = axisLength(days, entrants)
  const played = Math.max(0, ...entrants.map((e) => e.values.length))
  const k = Math.min(cursor ?? played, played)
  const labelWidth = useMemo(() => Math.min(104, Math.max(48, 18 + 6.4 * Math.max(0, ...lit.map((h) => short(byId.get(h.id)?.label ?? '').length)))), [lit, byId])
  const layout = useMemo(() => layoutRace({ entrants, days, lowerIsBetter: strokes, width, height: HEIGHT, labelWidth, axisWidth: AXIS }), [entrants, days, strokes, width, labelWidth])

  // The replay: the cover's and the coloured heads' transforms, set on the elements themselves.
  const coverRef = useRef<HTMLDivElement>(null)
  const heads = useRef(new Map<string, HTMLSpanElement>())
  const pos = useRef(played)
  const win = coverWindow(layout)
  const apply = useCallback(
    (at: number) => {
      pos.current = at
      const cover = coverRef.current
      if (cover) {
        const x = Math.round((layout.x(at) - win.left + REVEAL_PAD) * 10) / 10
        cover.style.transform = `translateX(${x}px)`
        cover.dataset.at = String(Math.round(at * 100) / 100)
      }
      for (const h of lit) {
        const e = byId.get(h.id)
        const el = heads.current.get(h.id)
        if (!e || !el) continue
        const p = pointAt(layout, e.values, at)
        el.style.transform = `translate(${Math.round(p.x * 10) / 10}px, ${Math.round(p.y * 10) / 10}px)`
      }
    },
    [layout, lit, byId, win.left],
  )
  useLayoutEffect(() => {
    if (!playing) apply(k)
  }, [apply, k, playing])

  const total = Math.min(MAX_MS, Math.max(MIN_MS, played * MS_PER_HOLE))
  useEffect(() => {
    if (!playing) return
    const from = pos.current
    const perHole = total / Math.max(1, played)
    let frame = 0
    let t0: number | undefined
    let shown = Math.floor(from)
    const tick = (now: number) => {
      t0 ??= now
      const at = Math.min(played, from + (now - t0) / perHole)
      apply(at)
      const whole = Math.floor(at)
      if (whole !== shown) {
        shown = whole
        setCursor(whole >= played ? null : whole)
      }
      if (at >= played) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, apply, played, total])
  // Asked for less motion mid-replay: the race shows whole at once.
  useEffect(() => {
    if (reduce && playing) {
      setPlaying(false)
      setCursor(null)
    }
  }, [reduce, playing])

  const play = () => {
    const from = k >= played ? 0 : k
    apply(from)
    setCursor(from)
    setPlaying(true)
  }
  const pause = () => {
    setPlaying(false)
    const at = Math.round(pos.current)
    setCursor(at >= played ? null : at)
  }
  const toEnd = () => {
    setPlaying(false)
    setCursor(null)
  }
  const readAt = (at: number) => {
    if (playing) setPlaying(false)
    setCursor(at >= played ? null : Math.max(0, at))
  }

  // A tap or a sideways drag on the drawing reads the race at the hole under it (the bar is the same for a
  // keyboard). A touch that turns into a scroll of the page reads nothing.
  const touch = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  const fromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / Math.max(1, box.width)) * width
    const at = Math.round(((px - layout.plot.left) / Math.max(1, layout.plot.right - layout.plot.left)) * n)
    readAt(Math.max(0, Math.min(played, at)))
  }

  const places = useMemo(() => placesAt(entrants, k, strokes), [entrants, k, strokes])
  const tied = useMemo(() => {
    const c = new Map<number, number>()
    for (const p of Object.values(places)) c.set(p, (c.get(p) ?? 0) + 1)
    return c
  }, [places])
  const labelY = useMemo(
    () => placeLabels(lit.map((h) => ({ id: h.id, y: layout.y(valueAt(byId.get(h.id)?.values ?? [], k)) })), layout.plot.top + 4, layout.plot.bottom - 2),
    [lit, layout, byId, k],
  )

  const summary = useMemo(() => {
    const s = summarize(entrants, days, strokes)
    if (!s) return title
    const at = s.tookLead ? R.at(s.tookLead.day, s.tookLead.hole, days.length) : null
    return R.summary({ title, count: entrants.length, pairs, holes: s.holes, leaders: s.leaders.map((x) => byId.get(x)?.label ?? ''), value: R.spoken(s.value, strokes), tookLead: at, wireToWire: s.wireToWire })
  }, [entrants, days, strokes, title, pairs, byId])

  const where = k === 0 ? R.start : (() => {
    const h = holeOf(days, k)
    return R.at(h.day, h.hole, days.length)
  })()
  const roleWords = (h: Highlight) =>
    h.roles
      .map((r) => (r === 'me' ? (pairs ? R.mine : R.me) : r === 'honoree' ? honoreeLabel : r === 'picked' ? R.picked : ''))
      .filter(Boolean)
      .join(', ')
  const others = entrants.filter((e) => !lit.some((h) => h.id === e.id))
  const canPlay = !reduce && played > 0

  return (
    <div className={styles.race}>
      <div className={styles.head}>
        <p className={styles.help}>
          {hint} {canPlay ? R.replayHint : R.scrubHint}
          {grey && <> {R.colourHint(pairs)}</>}
        </p>
        {canPlay && (
          <div className={styles.controls}>
            <Button size="sm" onClick={playing ? pause : play}>
              {playing ? <IconPause size={18} /> : <IconPlay size={18} />} {playing ? R.pause : cursor == null ? t.stats.play : R.resume}
            </Button>
            {(playing || cursor != null) && (
              <Button variant="ghost" size="sm" onClick={toEnd}>
                {R.end}
              </Button>
            )}
          </div>
        )}
      </div>

      <div ref={boxRef} className={styles.box}>
        <div
          className={styles.figureBox}
          style={{ height: HEIGHT }}
          role="img"
          aria-label={summary}
          onPointerDown={(e) => {
            touch.current = { x: e.clientX, y: e.clientY, dragging: false }
          }}
          onPointerMove={(e) => {
            const t0 = touch.current
            if (!t0) return
            const dx = Math.abs(e.clientX - t0.x)
            if (!t0.dragging && dx > 6 && dx > Math.abs(e.clientY - t0.y)) {
              t0.dragging = true
              e.currentTarget.setPointerCapture?.(e.pointerId)
            }
            if (t0.dragging) fromPointer(e)
          }}
          onPointerUp={(e) => {
            const t0 = touch.current
            touch.current = null
            if (t0 && !t0.dragging && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) <= 6) fromPointer(e)
          }}
          onPointerCancel={() => {
            touch.current = null
          }}
        >
          {/* Under everything: the grid, the figure axis and every line, painted once per size and data. */}
          <svg className={styles.layer} width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
            <Grid layout={layout} format={format} />
            <Lines layout={layout} entrants={entrants} lit={lit} />
          </svg>
          {/* The race not reached yet: card stock with the grid's own lines, slid by a transform. */}
          <div className={styles.window} style={{ left: win.left, top: win.top, width: win.width, height: win.height }}>
            <div ref={coverRef} className={styles.cover} data-reveal="">
              <svg width={win.width} height={win.height}>
                {layout.yTicks.map((tk) => (
                  <line key={tk.value} className={tk.value === 0 ? styles.zero : styles.grid} x1={0} x2={win.width} y1={tk.y - win.top} y2={tk.y - win.top} />
                ))}
              </svg>
            </div>
          </div>
          {/* Over it: the days and the hole axis, the hole being read, the heads and the names. */}
          <svg className={styles.layer} width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
            <HoleAxis layout={layout} days={days} />
            {!playing && k > 0 && k < played && <line className={styles.cursor} x1={layout.x(k)} x2={layout.x(k)} y1={layout.plot.top} y2={layout.plot.bottom} />}
            <g className={playing ? styles.labelsHidden : undefined}>
              {lit.map((h) => {
                const y = labelY[h.id] ?? 0
                const x = Math.min(layout.x(k), layout.plot.right) + 7
                return (
                  <g key={h.id} transform={`translate(${Math.round(x)} ${Math.round(y)})`}>
                    <line className={styles[`s${h.slot}`]} x1={0} x2={8} y1={0} y2={0} strokeWidth={2} />
                    <text className={styles.label} x={11} y={0} dy="0.35em">
                      {short(byId.get(h.id)?.label ?? '')}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
          {lit.map((h) => (
            <span
              key={h.id}
              ref={(el) => {
                if (el) heads.current.set(h.id, el)
                else heads.current.delete(h.id)
              }}
              className={`${styles.dot} ${styles[`d${h.slot}`]} ${h.roles.includes('me') ? styles.dotMine : ''}`}
            />
          ))}
        </div>
      </div>

      <input
        className={styles.scrub}
        type="range"
        min={0}
        max={played}
        step={1}
        value={k}
        aria-label={R.cursor}
        aria-valuetext={where}
        disabled={played === 0}
        onChange={(e) => readAt(Number(e.target.value))}
      />

      <div className={styles.readout}>
        <p className={styles.where}>{where}</p>
        <ul className={styles.key}>
          {[...lit]
            .sort((a, b) => (places[a.id] ?? 0) - (places[b.id] ?? 0) || order.indexOf(a.id) - order.indexOf(b.id))
            .map((h) => {
              const e = byId.get(h.id)!
              const p = places[h.id] ?? 0
              const role = roleWords(h)
              return (
                <li key={h.id} className={styles.keyRow}>
                  <span className={`${styles.swatch} ${styles[`sw${h.slot}`]}`} aria-hidden="true" />
                  <span className={styles.place}>{R.place(p, (tied.get(p) ?? 0) > 1)}</span>
                  <span className={styles.name}>
                    {e.label}
                    {role && <span className={styles.role}> {role}</span>}
                  </span>
                  <span className={styles.figure}>{format(valueAt(e.values, k))}</span>
                </li>
              )
            })}
          {grey && (
            <li className={styles.keyRow}>
              <span className={`${styles.swatch} ${styles.swGrey}`} aria-hidden="true" />
              <span className={styles.place} />
              <span className={styles.name}>{R.others(others.length, pairs)}</span>
              <span className={styles.figure} />
            </li>
          )}
        </ul>
      </div>

      {grey && (
        <Field label={R.pick}>
          <select
            className="select"
            value={picked && byId.has(picked) ? picked : ''}
            onChange={(e) => {
              const v = e.target.value || null
              setPicked(v)
              writePick(pickKey, v)
            }}
          >
            <option value="">{R.pickNone}</option>
            {entrants.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <Button variant="ghost" size="sm" aria-expanded={table} aria-controls={`${id}-table`} onClick={() => setTable((v) => !v)}>
          {table ? R.hideTable : R.showTable}
        </Button>
        <div id={`${id}-table`} hidden={!table}>
          {table && <RaceTable title={title} entrants={entrants} days={days} played={played} format={format} pairs={pairs} />}
        </div>
      </div>
    </div>
  )
}

/** The grid and the figure axis, under the lines: drawn once per size. */
const Grid = memo(function Grid({ layout, format }: { layout: RaceLayout; format: (v: number) => string }) {
  const { plot } = layout
  return (
    <g>
      {layout.yTicks.map((tk) => (
        <g key={tk.value}>
          <line className={tk.value === 0 ? styles.zero : styles.grid} x1={plot.left} x2={plot.right} y1={tk.y} y2={tk.y} />
          <text className={styles.tick} x={plot.left - 6} y={tk.y} dy="0.35em" textAnchor="end">
            {format(tk.value)}
          </text>
        </g>
      ))}
    </g>
  )
})

/** The days (a turn between them) and the hole axis, over the cover so they show the whole race's length. */
const HoleAxis = memo(function HoleAxis({ layout, days }: { layout: RaceLayout; days: readonly RaceDay[] }) {
  const { plot } = layout
  return (
    <g>
      {layout.bands.map((b, i) => (
        <g key={b.day}>
          {i > 0 && <line className={styles.turn} x1={b.x0} x2={b.x0} y1={plot.top} y2={plot.bottom} />}
          {days.length > 1 && (
            <text className={styles.day} x={(b.x0 + b.x1) / 2} y={plot.bottom + 28} textAnchor="middle">
              {b.x1 - b.x0 >= 44 ? t.round.day(b.day) : b.day}
            </text>
          )}
        </g>
      ))}
      <line className={styles.axis} x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
      {layout.xTicks.map((tk) => (
        <g key={tk.at}>
          <line className={styles.axis} x1={tk.x} x2={tk.x} y1={plot.bottom} y2={plot.bottom + 4} />
          <text className={styles.tick} x={tk.x} y={plot.bottom + 14} textAnchor="middle">
            {tk.label}
          </text>
        </g>
      ))}
    </g>
  )
})

/** Every entrant's path: the grey ones under the coloured. Drawn once per size and data, never per frame of a replay. */
const Lines = memo(function Lines({ layout, entrants, lit }: { layout: RaceLayout; entrants: readonly RaceEntrant[]; lit: readonly Highlight[] }) {
  const slot = new Map(lit.map((h) => [h.id, h]))
  return (
    <g fill="none">
      {entrants
        .filter((e) => !slot.has(e.id))
        .map((e) => (
          <path key={e.id} className={styles.context} d={layout.paths[e.id]} />
        ))}
      {/* This phone's own on top of the others, the rest in reverse so the first stand above the later. */}
      {[...lit].reverse().sort((a, b) => Number(a.roles.includes('me')) - Number(b.roles.includes('me'))).map((h) => (
        <path key={h.id} className={`${styles.line} ${styles[`s${h.slot}`]} ${h.roles.includes('me') ? styles.mine : ''}`} d={layout.paths[h.id]} />
      ))}
    </g>
  )
})

/** The whole race as a table: one row per entrant in the board's order, one column per hole played. */
function RaceTable({ title, entrants, days, played, format, pairs }: { title: string; entrants: readonly RaceEntrant[]; days: readonly RaceDay[]; played: number; format: (v: number) => string; pairs: boolean }) {
  const cols = Array.from({ length: played }, (_, i) => ({ k: i + 1, ...holeOf(days, i + 1) }))
  const groups: Array<{ day: number; span: number }> = []
  for (const c of cols) {
    const g = groups.at(-1)
    if (g?.day === c.day) g.span++
    else groups.push({ day: c.day, span: 1 })
  }
  const multi = days.length > 1
  return (
    <div className={styles.tableWrap} role="region" aria-label={R.tableName(title)} tabIndex={0}>
      <table className={`table ${styles.table}`}>
        <caption className="sr-only">{R.tableName(title)}</caption>
        <thead>
          {multi && (
            <tr>
              <td />
              {groups.map((g) => (
                <th key={g.day} scope="colgroup" colSpan={g.span}>
                  {t.round.day(g.day)}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th scope="col">{R.entrant(pairs)}</th>
            {cols.map((c) => (
              <th key={c.k} scope="col" className="num">
                <span className="sr-only">{R.at(c.day, c.hole, days.length)}</span>
                <span aria-hidden="true">{c.hole}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entrants.map((e) => (
            <tr key={e.id}>
              <th scope="row">{e.label}</th>
              {cols.map((c) => (
                <td key={c.k} className="num">
                  {c.k <= e.values.length ? format(e.values[c.k - 1]!) : '–'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Ceremonia (§9.10): reveals one at a time, each with drama, in the order of
 * the brief: last place, fewest putts, snake totals, best round per day,
 * pairs, 4th–2nd, the champion (confetti + the tournament's trophy), Calcutta payouts,
 * money summary. Only the enabled modules appear.
 *
 * It plays on the TV at the dinner, so it is sized for the room the way the
 * TV board is and wears the event's accent (VIS-06). Nothing on it scrolls,
 * since nobody scrolls a TV: a long list pages to the screen, and any other
 * step that would not fit is drawn a little smaller. A keyboard or a
 * presentation clicker runs it from across the room (UX-18). Each reveal is a
 * short sequence rather than a pop (MOT-23): the faces, then the name, then
 * the figures counting up, then the champion's trophy line with one burst of
 * confetti.
 */
import confetti from 'canvas-confetti'
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ordinal, t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney, formatSignedMoney } from '../../lib/money'
import { useTournamentCtx } from './TournamentGate'
import styles from './CeremonyScreen.module.css'
import { IconFlame, IconGavel, IconMedal, IconReceipt, IconRings, IconSnake, IconSpoon, IconTarget, IconTrophy } from '../../components/icons'
import { celebrationColors } from '../../lib/tokens'
import { REVEAL, ease, easeFast, easeSlow } from '../../design/motion'
import { nearestAccent } from '../../design/accents'
import { CountUp } from '../../components/CountUp'
import { figureKind, toParText, type Figure } from '../../engine/formats'
import { DEFAULT_SETTINGS } from '../../engine/settings/presets'
import { fromLine } from '../../engine/core/unassigned'

const C = t.ceremony
/** «A y B», «A, B e Iván». */
const andList = t.common.andList
/** «Hugo I.» never ends a line on «Hugo»: a last word of up to three letters is joined to the one before it. */
const keepInitial = (name: string) => name.replace(/ (\S{1,3})$/, '\u00A0$1')

/** A piece of a winner's second line: words, or a figure that counts up when revealed. */
type Part = string | { value: number; format: (n: number) => string }
const fig = (value: number, format: (n: number) => string): Part => ({ value, format })

/** One line of a list: a person (or a Calcutta slot) and a figure. */
interface ListRow {
  key: string
  name: ReactNode
  figure: string
  under?: boolean
}

interface Step {
  id: string
  title: string
  icon: ReactNode
  /** Winners to show big, with a line each. */
  winners: Array<{ playerIds: string[]; line: string; sub?: Part[] }>
  champion?: boolean
  /** A short list shown whole beside the main one (the Calcutta's slots). */
  aside?: ListRow[]
  /** The people the step is about, paged to the screen. */
  list?: ListRow[]
}

/** The narrowest a list column may get, in its own ems: a name and an amount side by side. */
const COLUMN_EM = 10
/** Never drawn smaller than this on a TV; past it a step can't be read anyway. */
const MIN_ZOOM = 0.2
/** A phone scrolls, so it zooms only this far and lets the rest scroll (a tie of twelve would be 9 px names). */
const MIN_ZOOM_PHONE = 0.75
/** Below this width the ceremony is on a phone: lists stack and the screen scrolls (the stylesheet's breakpoint). */
const PHONE = '(max-width: 999px)'
/** A tie of several drawn smaller than this is set as a compact list instead: there a name is half the screen's tenth, whatever the zoom would leave. */
const COMPACT_BELOW = 0.72

/** `content` sits inside `room`, and no name runs out of its line (a name never breaks inside a word). */
function holds(content: HTMLElement, room: HTMLElement): boolean {
  const c = content.getBoundingClientRect()
  const r = room.getBoundingClientRect()
  if (c.height > r.height + 1 || c.width > r.width + 1) return false
  return !Array.from(content.querySelectorAll<HTMLElement>('[data-name]')).some((n) => n.scrollWidth > n.clientWidth + 1)
}

/**
 * The largest zoom, at most 1, at which `fits()` holds once `el` is drawn at
 * it. Zoom re-flows what it scales (a grid's rem minimums shrink with it, so
 * more columns fit), so each guess is measured rather than derived from the
 * unzoomed size: a single estimate drew a tie of twelve at a fifth of its
 * room.
 */
function bestZoom(el: HTMLElement, prop: string, fits: () => boolean): number {
  const at = (k: number) => {
    el.style.setProperty(prop, k >= 0.999 ? '1' : k.toFixed(3))
    return fits()
  }
  if (at(1)) return 1
  let lo = window.matchMedia(PHONE).matches ? MIN_ZOOM_PHONE : MIN_ZOOM
  let hi = 1
  if (!at(lo)) return lo
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2
    if (at(mid)) lo = mid
    else hi = mid
  }
  at(lo)
  return lo
}

/**
 * A list that pages to the screen instead of scrolling: as many columns as fit
 * side by side, as many rows as fit in the height it is given, and the next
 * page on the next beat. Rows are one line each, so every row has the height
 * of the first one. On a phone the list isn't given a height (the stylesheet
 * lets it grow), so it measures as one page and the screen scrolls.
 */
function PagedList({ rows, page, onPages }: { rows: ListRow[]; page: number; onPages: (pages: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  // Until measured, every row is laid out once (before paint) so a row can be measured.
  const [fit, setFit] = useState<{ perColumn: number; columns: number } | null>(null)
  const measuredFor = useRef('')
  const [resized, remeasure] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    const list = el?.firstElementChild as HTMLElement | null
    const first = list?.firstElementChild as HTMLElement | null
    if (!el || !list || !first) return
    const key = `${el.clientWidth}x${el.clientHeight}:${rows.length}`
    if (key !== measuredFor.current) {
      measuredFor.current = key
      if (fit !== null) {
        setFit(null)
        return
      }
    }
    const style = getComputedStyle(list)
    const gap = parseFloat(style.columnGap) || 0
    const perColumn = Math.max(1, Math.floor(el.clientHeight / first.getBoundingClientRect().height))
    const columns = Math.max(1, Math.floor((el.clientWidth + gap) / (COLUMN_EM * parseFloat(style.fontSize) + gap)))
    if (fit?.perColumn !== perColumn || fit.columns !== columns) setFit({ perColumn, columns })
  }, [rows.length, fit, resized])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => remeasure((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const perPage = Math.max(1, fit ? fit.perColumn * fit.columns : rows.length)
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  // Before paint, with the reveal: a second press right after it pages the list
  // instead of finding one page and leaving the step (a passive effect reported
  // it a task later, and a quick clicker skipped every page after the first).
  useLayoutEffect(() => onPages(pages), [pages, onPages])
  const at = Math.min(page, pages - 1)
  const shown = rows.slice(at * perPage, at * perPage + perPage)
  // Balanced: twelve people as two columns of six, not nine and three.
  const columns = fit ? Math.max(1, Math.min(fit.columns, Math.ceil(shown.length / fit.perColumn))) : 1
  const perColumn = Math.max(1, Math.ceil(shown.length / columns))
  return (
    <div className={styles.paged}>
      <div ref={box} className={styles.listBox}>
        <div className={styles.list} style={{ gridAutoFlow: 'column', gridTemplateRows: `repeat(${perColumn}, auto)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {shown.map((r) => (
            <Row key={r.key} row={r} />
          ))}
        </div>
      </div>
      {/* Always there, so the list's height doesn't change when a second page appears. */}
      <p className={styles.range} aria-hidden={pages < 2 || undefined} style={pages < 2 ? { visibility: 'hidden' } : undefined}>
        {t.tv.range(at * perPage + 1, at * perPage + shown.length, rows.length)}
      </p>
    </div>
  )
}

function Row({ row }: { row: ListRow }) {
  return (
    <div className={styles.listRow}>
      <span className={styles.listName}>{row.name}</span>
      <span className={row.under ? styles.neg : styles.pos}>{row.figure}</span>
    </div>
  )
}

export function CeremonyScreen() {
  const data = useTournament((s) => s.data)
  const { slug } = useTournamentCtx()
  const [idx, setIdx] = useState(-1)
  const [revealed, setRevealed] = useState(false)
  /** The page of the step's list on screen, and how many it has at this screen size. */
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)

  const steps = useMemo((): Step[] => {
    if (!data) return []
    const { snapshot, state, settings } = data
    const m = state.modules
    // A short last word (an initial, «Hugo I.») stays on its name's line.
    const nameOf = (id: string) => keepInitial(snapshot.players.find((p) => p.id === id)?.displayName ?? '?')
    /**
     * The main event speaks its own figure and names its own entrants
     * (STRAT-03): a team by its name with its members' faces, strokes as the
     * board writes them against par («−11 neto»), match points with their
     * halves. Before, a stroke-play champion won with «61 puntos» and a team
     * champion was «?».
     */
    const kind = figureKind(settings)
    const mainFig = (f: Figure) =>
      kind === 'points' || kind === 'match' ? fig(f.value, C.withPoints) : fig(f.rank ?? f.value, (n) => t.common.figure(toParText(n), n, kind))
    const entrants = new Map((m.individual?.rows ?? []).map((r) => [r.playerId, r.entrant]))
    const entrantLine = (id: string) => {
      const e = entrants.get(id)
      return e?.isTeam ? keepInitial(e.name) : nameOf(id)
    }
    const facesOf = (ids: string[]) => ids.flatMap((id) => entrants.get(id)?.playerIds ?? [id])
    const out: Step[] = []
    /**
     * What the Comité gave or gave back from a line's «por asignar»
     * (MONEY-05), by person: the night's totals are the money Dinero pays. A
     * step of its own after the line's, since a decision is per line, not per
     * day or place (the snake's totals count it in).
     */
    const comiteStep = (line: string, label: string, icon: ReactNode) => {
      const totals = new Map<string, number>()
      for (const p of state.prizes) if (p.moduleId === 'adjustment' && p.sourceKey === line) totals.set(p.playerId, (totals.get(p.playerId) ?? 0) + p.amount)
      const rows = [...totals].sort((a, b) => b[1] - a[1])
      if (rows.length) out.push({ id: `comite-${line}`, title: C.steps.byComite(label), icon, winners: [], list: rows.map(([pid, amt]) => ({ key: pid, name: nameOf(pid), figure: formatMoney(amt) })) })
    }
    // Last place only where the tournament gave it a name of its own (a trophy, a roast): «Último lugar» is no prize.
    if (m.individual && m.individual.lastPlace.length && settings.labels.lastPlace !== DEFAULT_SETTINGS.labels.lastPlace) {
      out.push({ id: 'last', title: settings.labels.lastPlace, icon: <IconSpoon size={64} />, winners: [{ playerIds: facesOf(m.individual.lastPlace), line: andList(m.individual.lastPlace.map(entrantLine)) }] })
    }
    if (m.fewestPutts) {
      const ids = Object.keys(m.fewestPutts.prizes)
      if (ids.length) {
        const row = m.fewestPutts.rows.find((r) => r.playerId === ids[0])
        out.push({ id: 'putts', title: settings.modules.fewestPutts.label, icon: <IconTarget size={64} />, winners: [{ playerIds: ids, line: andList(ids.map(nameOf)), sub: row ? [fig(row.putts, t.games.puttsFigure), fig(m.fewestPutts.prizes[ids[0]!]!.amount, formatMoney)] : undefined }] })
      }
      comiteStep('fewestPutts', settings.modules.fewestPutts.label, <IconTarget size={64} />)
    }
    if (m.snake) {
      const totals = new Map<string, number>()
      // The snake's own prizes and what the Comité gave or gave back from its line (a cancelled day, MONEY-05).
      for (const p of state.prizes) if (fromLine(p, 'snake')) totals.set(p.playerId, (totals.get(p.playerId) ?? 0) + p.amount)
      const rows = [...totals].sort((a, b) => b[1] - a[1])
      if (rows.length) {
        const gold = state.stats.awards.find((a) => a.id === 'snakeGold')
        out.push({
          id: 'snake',
          title: C.steps.snake(settings.modules.snake.label),
          icon: <IconSnake size={64} />,
          winners: gold ? [{ playerIds: gold.playerIds, line: andList(gold.playerIds.map(nameOf)), sub: [t.stats.award.snakeGold.name, fig(gold.value, C.holesHeld)] }] : [],
          list: rows.map(([pid, amt]) => ({ key: pid, name: nameOf(pid), figure: formatMoney(amt) })),
        })
      }
    }
    if (m.bestRound) {
      for (const day of m.bestRound.days) {
        const ids = Object.keys(day.winners)
        if (!ids.length) continue
        const pts = day.rows.find((r) => r.playerId === ids[0])?.points
        out.push({ id: `best${day.roundNumber}`, title: C.steps.bestRound(settings.modules.bestRound.label, day.roundNumber), icon: <IconFlame size={64} />, winners: [{ playerIds: ids, line: andList(ids.map(nameOf)), sub: pts != null ? [fig(pts, C.withPoints), fig(day.winners[ids[0]!]!.amount, formatMoney)] : undefined }] })
      }
      comiteStep('bestRound', settings.modules.bestRound.label, <IconFlame size={64} />)
    }
    // Instance games: who took money from each (pots and bets alike).
    for (const g of Object.values(state.games)) {
      const totals = new Map<string, number>()
      for (const p of state.prizes) {
        if (p.gameId !== g.config.id) continue
        totals.set(p.playerId, (totals.get(p.playerId) ?? 0) + p.amount)
        if (p.payerId) totals.set(p.payerId, (totals.get(p.payerId) ?? 0) - p.amount)
      }
      const rows = [...totals].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])
      if (!rows.length) continue
      const top = rows.filter(([, v]) => v === rows[0]![1]).map(([id]) => id)
      out.push({
        id: `game-${g.config.id}`,
        title: g.config.label,
        icon: <IconTarget size={64} />,
        winners: [{ playerIds: top, line: andList(top.map(nameOf)), sub: [fig(rows[0]![1], formatMoney)] }],
        list: rows.map(([pid, amt]) => ({ key: pid, name: nameOf(pid), figure: amt < 0 ? `−${formatMoney(-amt)}` : formatMoney(amt), under: amt < 0 })),
      })
    }
    if (m.pairs) {
      const podium = m.pairs.rows.filter((r) => r.position <= settings.prizes.pairs.length)
      if (podium.length) {
        out.push({
          id: 'pairs',
          title: settings.modules.pairs.label,
          icon: <IconRings size={64} />,
          winners: [...podium].reverse().map((r) => ({ playerIds: [...r.playerIds], line: `${ordinal(r.label)}, ${r.name}`, sub: [andList(r.playerIds.map(nameOf)), fig(r.total, C.withPoints)] })),
        })
      }
    }
    if (m.individual) {
      const places = settings.prizes.stableford.length
      for (let place = places; place >= 2; place--) {
        const rows = m.individual.rows.filter((r) => r.position === place)
        if (!rows.length) continue
        out.push({ id: `place${place}`, title: C.steps.place(place), icon: <IconMedal size={64} />, winners: rows.map((r) => ({ playerIds: [...r.entrant.playerIds], line: entrantLine(r.playerId), sub: [mainFig(r.figure), ...(m.individual!.prizes[r.playerId] ? [fig(m.individual!.prizes[r.playerId]!.amount, formatMoney)] : [])] })) })
      }
      // Places nobody filled, given by the Comité: before the champion, who closes the night.
      comiteStep('individual', settings.modules.individual.label, <IconMedal size={64} />)
      const champs = m.individual.rows.filter((r) => r.position === 1)
      if (champs.length) {
        out.push({ id: 'champion', title: C.steps.place(1), icon: <IconTrophy size={64} />, champion: true, winners: champs.map((r) => ({ playerIds: [...r.entrant.playerIds], line: entrantLine(r.playerId), sub: [mainFig(r.figure), ...(m.individual!.prizes[r.playerId] ? [fig(m.individual!.prizes[r.playerId]!.amount, formatMoney)] : [])] })) })
      }
    }
    if (m.auction && m.auction.soldCount > 0) {
      const payouts = Object.values(m.auction.payouts).sort((a, b) => b.amount - a.amount)
      out.push({
        id: 'auction',
        title: C.steps.auction(settings.modules.auction.label),
        icon: <IconGavel size={64} />,
        winners: [],
        aside: m.auction.slots.map((s, i) => ({
          key: `slot${i}`,
          name: (
            <>
              {s.label}: <strong>{s.unfilled ? t.games.unassigned : andList(s.playerIds.map(nameOf))}</strong>
            </>
          ),
          figure: formatMoney(s.amount),
        })),
        // Nobody has cashed yet (no scores): the slots alone, not an empty list.
        list: payouts.length ? payouts.map((p) => ({ key: p.ownerId, name: nameOf(p.ownerId), figure: formatMoney(p.amount) })) : undefined,
      })
    }
    const people = snapshot.players.map((p) => state.money.people[p.id]!).filter(Boolean).sort((a, b) => b.net - a.net)
    if (people.length) {
      out.push({
        id: 'money',
        title: C.steps.money,
        icon: <IconReceipt size={64} />,
        winners: [],
        list: people.map((p) => ({ key: p.playerId, name: nameOf(p.playerId), figure: formatSignedMoney(p.net), under: p.net < 0 })),
      })
    }
    return out
  }, [data])

  const step = idx >= 0 ? steps[idx] : undefined
  const reduce = useReducedMotionConfig()
  /** A beat of the reveal, in seconds from «Revelar»; with reduced motion everything lands at once. */
  const at = (s: number) => (reduce ? 0 : s)
  // With reduced motion nothing moves into place, not even for the one frame before Motion jumps to the end: that
  // frame drew a card 24 px low (unseen, at opacity 0), and the stage could scroll by it.
  const rise = (px: number) => (reduce ? 0 : px)
  useEffect(() => {
    if (!revealed || !step?.champion || reduce) return
    // One burst, as the trophy line lands.
    const timer = setTimeout(() => confetti({ particleCount: 200, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors: celebrationColors() }), REVEAL.trophy * 1000)
    return () => clearTimeout(timer)
  }, [revealed, step?.id, step?.champion, reduce])

  /** To another step, waiting for its reveal. */
  const go = (d: number) => {
    setRevealed(false)
    setPage(0)
    setPages(1)
    setIdx((i) => Math.max(-1, Math.min(steps.length, i + d)))
  }
  // A list that now takes fewer pages (a bigger screen, a correction) shows its last one.
  const shownPage = Math.min(page, pages - 1)
  /** «Siguiente»: the list's next page, else the next step. */
  const next = () => (revealed && shownPage < pages - 1 ? setPage(shownPage + 1) : go(1))
  /** «Anterior»: the list's previous page, else the previous step. */
  const prev = () => (revealed && shownPage > 0 ? setPage(shownPage - 1) : go(-1))
  /** The next beat: reveal this step, its list's next page, the next step. «Siguiente» and the keys both do it. */
  const forward = () => (idx >= 0 && idx < steps.length && !revealed ? setRevealed(true) : next())
  /*
   * A keyboard or a presentation clicker runs the show: →, PageDown, Space or
   * Enter is the next beat, ← or PageUp goes back. Space and Enter on a focused
   * button are that button's own press, and «Siguiente» is the same beat, so a
   * mouse click that leaves it focused never turns Space into a skip. A held
   * key doesn't race through the reveals.
   */
  const keys = useRef({ forward: () => {}, back: () => {} })
  keys.current = { forward, back: prev }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      const onControl = e.target instanceof Element && !!e.target.closest('button, a, input, textarea, select')
      const forward = e.key === 'ArrowRight' || e.key === 'PageDown' || (!onControl && (e.key === ' ' || e.key === 'Enter'))
      const back = e.key === 'ArrowLeft' || e.key === 'PageUp'
      if (!forward && !back) return
      e.preventDefault()
      if (forward) keys.current.forward()
      else keys.current.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /*
   * Nothing scrolls on a TV, so what would not fit is drawn smaller: a step
   * without a list zooms its whole reveal to the room under the title
   * (`--fit`: a long name, a tie of three, the «provisional» line taking a
   * row), and beside a list the winner's column zooms to its height (`--wfit`:
   * a tie for the snake's gold, four tied for a contest). A name never breaks
   * inside a word; it is drawn smaller first. A tie of many that would end up
   * too small to read is set as a compact list instead (VIS-06).
   */
  const body = useRef<HTMLDivElement>(null)
  // The step's own area: while the last step leaves, both are on the page.
  const areaOf = (id: string | undefined) => (id ? body.current?.querySelector<HTMLElement>(`[data-area="${id}"]`) : null) ?? null
  const [areaSize, setAreaSize] = useState('')
  /** The step whose winners are set as a compact list, at the area size that needed it: a bigger screen tries the full size again. */
  const [compact, setCompact] = useState<{ step: string; size: string } | null>(null)
  const isCompact = !!step && compact?.step === step.id && compact.size === areaSize
  useLayoutEffect(() => {
    const area = areaOf(step?.id)
    const reveal = area?.querySelector<HTMLElement>('[data-reveal]')
    if (!step || !area || !reveal) return
    const winners = reveal.querySelector<HTMLElement>('[data-winners]')
    let k = 1
    if (reveal.hasAttribute('data-fit')) k = bestZoom(area, '--fit', () => holds(reveal, area))
    // Beside a list, on a screen wide enough to put them side by side.
    else if (winners && getComputedStyle(reveal).display === 'grid') k = bestZoom(winners, '--wfit', () => holds(winners, reveal))
    if (k < COMPACT_BELOW && step.winners.length > 1 && !isCompact) setCompact({ step: step.id, size: areaSize })
  }, [step, revealed, areaSize, data, isCompact])
  useLayoutEffect(() => {
    const el = areaOf(step?.id)
    if (!el) return
    const ro = new ResizeObserver(() => setAreaSize(`${el.clientWidth}x${el.clientHeight}`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [step?.id])

  if (!data) return null
  const { snapshot, state } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  /** When the lists start, after the winners have landed. */
  const listsAt = step && step.winners.length ? (step.winners.length - 1) * REVEAL.nextWinner + REVEAL.figures : 0

  return (
    <div className={styles.stage} style={{ '--event-accent': nearestAccent(snapshot.tournament.accentColor).hex } as React.CSSProperties}>
      <header className={styles.header}>
        {snapshot.tournament.logoUrl && <img src={snapshot.tournament.logoUrl} alt="" className={styles.logo} />}
        <div className="grow">
          <h1 className={styles.title}>{C.title}</h1>
          <span className={styles.sub}>{snapshot.tournament.name}</span>
        </div>
        <Link to={`/t/${slug}`} className={styles.exit}>
          {t.tv.exit}
        </Link>
      </header>
      {!state.tournamentFinal && <p className={styles.warn}>{C.notFinal}</p>}

      {/* On a phone a long step scrolls: keyboard users reach it (axe: scrollable-region-focusable). */}
      <div ref={body} className={styles.body} tabIndex={0} role="region" aria-label={step?.title ?? C.title}>
        {/* The next view comes in while the last one leaves, so the stage is never blank between steps (MOT-01). */}
        <AnimatePresence mode="popLayout" initial={false}>
          {idx < 0 && (
            <motion.div key="start" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: easeSlow }} exit={{ opacity: 0, transition: easeFast }} transition={easeSlow}>
              <p className={styles.hint}>{C.hint}</p>
              <button className={`btn btn--primary ${styles.bigBtn}`} type="button" onClick={() => go(1)}>
                {C.start}
              </button>
            </motion.div>
          )}
          {step && (
            <motion.div key={step.id} className={styles.step} initial={{ opacity: 0, y: rise(16) }} animate={{ opacity: 1, y: 0, transition: easeSlow }} exit={{ opacity: 0, y: rise(-16), transition: easeFast }} transition={easeSlow}>
              <span className={styles.stepIcon}>{step.icon}</span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <div data-area={step.id} className={styles.area}>
                {!revealed ? (
                  <button className={`btn btn--primary ${styles.bigBtn}`} type="button" onClick={() => setRevealed(true)}>
                    {C.reveal}
                  </button>
                ) : (
                  <div data-reveal className={styles.reveal} data-split={((step.winners.length > 0 || !!step.aside) && !!step.list) || undefined} data-list={!!step.list || undefined} data-fit={!step.list || undefined}>
                    {step.winners.length > 0 && (
                      <div data-winners className={styles.winners} data-many={step.winners.length > 1 || undefined} data-compact={isCompact || undefined}>
                        {step.winners.map((w, i) => {
                          const from = i * REVEAL.nextWinner
                          return (
                            <motion.div key={i} className={`${styles.winner} ${step.champion ? styles.champion : ''}`} initial={{ opacity: 0, y: rise(24) }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSlow, delay: at(from) }}>
                              <div className={styles.avatars}>
                                {w.playerIds.map((pid) => (
                                  <Avatar key={pid} name={byId.get(pid)?.displayName ?? '?'} url={byId.get(pid)?.avatarUrl} size="lg" honoree={byId.get(pid)?.isHonoree} />
                                ))}
                              </div>
                              <motion.span data-name className={styles.winnerLine} initial={{ opacity: 0, y: rise(12) }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSlow, delay: at(from + REVEAL.name) }}>
                                {w.line}
                              </motion.span>
                              {w.sub && (
                                <motion.span className={styles.winnerSub} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...ease, delay: at(from + REVEAL.figures) }}>
                                  {w.sub.map((part, j) => {
                                    // Read aloud as one line, «73 puntos, $10,000»; seen as plates.
                                    const comma = j < w.sub!.length - 1 && <span className="sr-only">, </span>
                                    return typeof part === 'string' ? (
                                      <span key={j}>
                                        {part}
                                        {comma}
                                      </span>
                                    ) : (
                                      <span key={j} className={`${styles.plate} ${step.champion ? styles.plateLeader : ''}`}>
                                        <CountUp value={part.value} format={part.format} delayMs={at(from + REVEAL.figures) * 1000} />
                                        {comma}
                                      </span>
                                    )
                                  })}
                                </motion.span>
                              )}
                              {step.champion && (
                                <motion.span className={styles.trophy} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...easeSlow, delay: at(from + REVEAL.trophy) }}>
                                  {/* The trophy is the tournament's own (labels.trophy); none named, none claimed. */}
                                  {data?.settings.labels.trophy ? `${C.champion}. ${C.trophy(data.settings.labels.trophy)}` : `${C.champion}.`}
                                </motion.span>
                              )}
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                    {step.aside && (
                      <motion.div className={styles.aside} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...ease, delay: at(listsAt) }}>
                        <div className={styles.list}>
                          {step.aside.map((r) => (
                            <Row key={r.key} row={r} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                    {step.list && (
                      <motion.div className={styles.listArea} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...ease, delay: at(listsAt) }}>
                        <PagedList rows={step.list} page={shownPage} onPages={setPages} />
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {idx >= steps.length && (
            <motion.div key="end" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: easeSlow }} exit={{ opacity: 0, transition: easeFast }} transition={easeSlow}>
              <h2 className={styles.stepTitle}>{C.done}</h2>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className={styles.footer}>
        <button className="btn btn--ghost" type="button" disabled={idx < 0} onClick={prev}>
          {C.prev}
        </button>
        <span className={styles.progress}>{idx >= 0 ? `${Math.min(idx + 1, steps.length)} / ${steps.length}` : ''}</span>
        <button className="btn btn--secondary" type="button" disabled={idx >= steps.length} onClick={forward}>
          {C.next}
        </button>
      </footer>
    </div>
  )
}

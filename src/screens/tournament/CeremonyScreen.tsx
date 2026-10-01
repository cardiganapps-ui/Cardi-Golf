/**
 * Ceremonia (§9.10): reveals one at a time, each with drama, in the order of
 * the brief: last place, fewest putts, snake totals, best round per day,
 * pairs, 4th–2nd, the champion (confetti + the Putter), Calcutta payouts,
 * money summary. Only the enabled modules appear.
 *
 * It plays on the TV at the dinner, so it is sized for the room the way the
 * TV board is and wears the event's accent (VIS-06). A keyboard or a
 * presentation clicker runs it from across the room (UX-18). Each reveal is a
 * short sequence rather than a pop (MOT-23): the faces, then the name, then
 * the figures counting up, then the champion's trophy line with one burst of
 * confetti.
 */
import confetti from 'canvas-confetti'
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
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

const C = t.ceremony
/** "A y B", "A, B y C". */
const andList = t.common.andList

/** A piece of a winner's second line: words, or a figure that counts up when revealed. */
type Part = string | { value: number; format: (n: number) => string }
const fig = (value: number, format: (n: number) => string): Part => ({ value, format })

interface Step {
  id: string
  title: string
  icon: ReactNode
  /** Winners to show big, with a line each. */
  winners: Array<{ playerIds: string[]; line: string; sub?: Part[] }>
  champion?: boolean
  extra?: ReactNode
}

export function CeremonyScreen() {
  const data = useTournament((s) => s.data)
  const { slug } = useTournamentCtx()
  const [idx, setIdx] = useState(-1)
  const [revealed, setRevealed] = useState(false)

  const steps = useMemo((): Step[] => {
    if (!data) return []
    const { snapshot, state, settings } = data
    const m = state.modules
    const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
    const out: Step[] = []
    if (m.individual && m.individual.lastPlace.length) {
      out.push({ id: 'last', title: settings.labels.lastPlace, icon: <IconSpoon size={64} />, winners: [{ playerIds: m.individual.lastPlace, line: andList(m.individual.lastPlace.map(nameOf)) }] })
    }
    if (m.fewestPutts) {
      const ids = Object.keys(m.fewestPutts.prizes)
      if (ids.length) {
        const row = m.fewestPutts.rows.find((r) => r.playerId === ids[0])
        out.push({ id: 'putts', title: settings.modules.fewestPutts.label, icon: <IconTarget size={64} />, winners: [{ playerIds: ids, line: andList(ids.map(nameOf)), sub: row ? [fig(row.putts, t.games.puttsFigure), fig(m.fewestPutts.prizes[ids[0]!]!.amount, formatMoney)] : undefined }] })
      }
    }
    if (m.snake) {
      const totals = new Map<string, number>()
      for (const p of state.prizes) if (p.moduleId === 'snake') totals.set(p.playerId, (totals.get(p.playerId) ?? 0) + p.amount)
      const rows = [...totals].sort((a, b) => b[1] - a[1])
      if (rows.length) {
        const gold = state.stats.awards.find((a) => a.id === 'snakeGold')
        out.push({
          id: 'snake',
          title: C.steps.snake(settings.modules.snake.label),
          icon: <IconSnake size={64} />,
          winners: gold ? [{ playerIds: gold.playerIds, line: andList(gold.playerIds.map(nameOf)), sub: [t.stats.award.snakeGold.name, fig(gold.value, C.holesHeld)] }] : [],
          extra: (
            <div className={styles.list} data-long={rows.length > 6 || undefined}>
              {rows.map(([pid, amt]) => (
                <div key={pid} className={styles.listRow}>
                  <span>{nameOf(pid)}</span>
                  <span>{formatMoney(amt)}</span>
                </div>
              ))}
            </div>
          ),
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
        extra: (
          <div className={styles.list} data-long={rows.length > 6 || undefined}>
            {rows.map(([pid, amt]) => (
              <div key={pid} className={styles.listRow}>
                <span>{nameOf(pid)}</span>
                <span>{amt < 0 ? `−${formatMoney(-amt)}` : formatMoney(amt)}</span>
              </div>
            ))}
          </div>
        ),
      })
    }
    if (m.pairs) {
      const podium = m.pairs.rows.filter((r) => r.position <= settings.prizes.pairs.length)
      if (podium.length) {
        out.push({
          id: 'pairs',
          title: settings.modules.pairs.label,
          icon: <IconRings size={64} />,
          winners: [...podium].reverse().map((r) => ({ playerIds: [...r.playerIds], line: `${r.label}º, ${r.name}`, sub: [t.common.and(nameOf(r.playerIds[0]), nameOf(r.playerIds[1])), fig(r.total, C.withPoints)] })),
        })
      }
    }
    if (m.individual) {
      const places = settings.prizes.stableford.length
      for (let place = places; place >= 2; place--) {
        const rows = m.individual.rows.filter((r) => r.position === place)
        if (!rows.length) continue
        out.push({ id: `place${place}`, title: C.steps.place(place), icon: <IconMedal size={64} />, winners: rows.map((r) => ({ playerIds: [r.playerId], line: nameOf(r.playerId), sub: [fig(r.total, C.withPoints), ...(m.individual!.prizes[r.playerId] ? [fig(m.individual!.prizes[r.playerId]!.amount, formatMoney)] : [])] })) })
      }
      const champs = m.individual.rows.filter((r) => r.position === 1)
      if (champs.length) {
        out.push({ id: 'champion', title: C.steps.place(1), icon: <IconTrophy size={64} />, champion: true, winners: champs.map((r) => ({ playerIds: [r.playerId], line: nameOf(r.playerId), sub: [fig(r.total, C.withPoints), ...(m.individual!.prizes[r.playerId] ? [fig(m.individual!.prizes[r.playerId]!.amount, formatMoney)] : [])] })) })
      }
    }
    if (m.auction && m.auction.soldCount > 0) {
      const payouts = Object.values(m.auction.payouts).sort((a, b) => b.amount - a.amount)
      out.push({
        id: 'auction',
        title: C.steps.auction(settings.modules.auction.label),
        icon: <IconGavel size={64} />,
        winners: [],
        extra: (
          <div className={styles.lists}>
            <div className={styles.list}>
              {m.auction.slots.map((s, i) => (
                <div key={i} className={styles.listRow}>
                  <span>
                    {s.label}: <strong>{s.unfilled ? t.games.unassigned : andList(s.playerIds.map(nameOf))}</strong>
                  </span>
                  <span>{formatMoney(s.amount)}</span>
                </div>
              ))}
            </div>
            <div className={styles.list} data-long={payouts.length > 6 || undefined}>
              {payouts.map((p) => (
                <div key={p.ownerId} className={styles.listRow}>
                  <span>{nameOf(p.ownerId)}</span>
                  <span>{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      })
    }
    const people = snapshot.players.map((p) => state.money.people[p.id]!).filter(Boolean).sort((a, b) => b.net - a.net)
    out.push({
      id: 'money',
      title: C.steps.money,
      icon: <IconReceipt size={64} />,
      winners: [],
      extra: (
        <div className={styles.list} data-long={people.length > 6 || undefined}>
          {people.map((p) => (
            <div key={p.playerId} className={styles.listRow}>
              <span>{nameOf(p.playerId)}</span>
              <span className={p.net >= 0 ? styles.pos : styles.neg}>{formatSignedMoney(p.net)}</span>
            </div>
          ))}
        </div>
      ),
    })
    return out
  }, [data])

  const step = idx >= 0 ? steps[idx] : undefined
  const reduce = useReducedMotionConfig()
  /** A beat of the reveal, in seconds from «Revelar»; with reduced motion everything lands at once. */
  const at = (s: number) => (reduce ? 0 : s)
  useEffect(() => {
    if (!revealed || !step?.champion || reduce) return
    // One burst, as the trophy line lands.
    const timer = setTimeout(() => confetti({ particleCount: 200, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors: celebrationColors() }), REVEAL.trophy * 1000)
    return () => clearTimeout(timer)
  }, [revealed, step?.id, step?.champion, reduce])

  const go = (d: number) => {
    setRevealed(false)
    setIdx((i) => Math.max(-1, Math.min(steps.length, i + d)))
  }
  /*
   * A keyboard or a presentation clicker runs the show: →, PageDown, Space or
   * Enter is the next beat (reveal this step, then move on), ← or PageUp goes
   * back. Space and Enter on a focused button are that button's own press.
   * A held key doesn't race through the reveals.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      const onControl = e.target instanceof Element && !!e.target.closest('button, a, input, textarea, select')
      const forward = e.key === 'ArrowRight' || e.key === 'PageDown' || (!onControl && (e.key === ' ' || e.key === 'Enter'))
      const back = e.key === 'ArrowLeft' || e.key === 'PageUp'
      if (!forward && !back) return
      e.preventDefault()
      if (forward && idx >= 0 && idx < steps.length && !revealed) {
        setRevealed(true)
        return
      }
      setRevealed(false)
      setIdx(Math.max(-1, Math.min(steps.length, idx + (forward ? 1 : -1))))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, revealed, steps.length])

  if (!data) return null
  const { snapshot, state } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))

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

      <div className={styles.body}>
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
            <motion.div key={step.id} className={styles.center} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: easeSlow }} exit={{ opacity: 0, y: -16, transition: easeFast }} transition={easeSlow}>
              <span className={styles.stepIcon}>{step.icon}</span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              {!revealed ? (
                <button className={`btn btn--primary ${styles.bigBtn}`} type="button" onClick={() => setRevealed(true)}>
                  {C.reveal}
                </button>
              ) : (
                <div className={styles.reveal} data-split={(step.winners.length > 0 && !!step.extra) || undefined}>
                  {step.winners.length > 0 && (
                    <div className={styles.winners} data-many={step.winners.length > 1 || undefined}>
                      {step.winners.map((w, i) => {
                        const from = i * REVEAL.nextWinner
                        return (
                          <motion.div key={i} className={`${styles.winner} ${step.champion ? styles.champion : ''}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSlow, delay: at(from) }}>
                            <div className={styles.avatars}>
                              {w.playerIds.map((pid) => (
                                <Avatar key={pid} name={byId.get(pid)?.displayName ?? '?'} url={byId.get(pid)?.avatarUrl} size="lg" honoree={byId.get(pid)?.isHonoree} />
                              ))}
                            </div>
                            <motion.span className={styles.winnerLine} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSlow, delay: at(from + REVEAL.name) }}>
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
                                {C.champion}. {C.trophy}
                              </motion.span>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                  {step.extra && (
                    <motion.div className={styles.extra} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...ease, delay: at(step.winners.length ? (step.winners.length - 1) * REVEAL.nextWinner + REVEAL.figures : 0) }}>
                      {step.extra}
                    </motion.div>
                  )}
                </div>
              )}
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
        <button className="btn btn--ghost" type="button" disabled={idx < 0} onClick={() => go(-1)}>
          {C.prev}
        </button>
        <span className={styles.progress}>{idx >= 0 ? `${Math.min(idx + 1, steps.length)} / ${steps.length}` : ''}</span>
        <button className="btn btn--secondary" type="button" disabled={idx >= steps.length} onClick={() => go(1)}>
          {C.next}
        </button>
      </footer>
    </div>
  )
}

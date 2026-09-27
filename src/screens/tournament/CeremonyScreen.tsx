/**
 * Ceremonia (§9.10): reveals one at a time, each with drama, in the order of
 * the brief: last place, fewest putts, snake totals, best round per day,
 * pairs, 4th–2nd, the champion (confetti + the Putter), Calcutta payouts,
 * money summary. Only the enabled modules appear.
 */
import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { Wave } from '../../components/Wave'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney, formatSignedMoney } from '../../lib/money'
import { useTournamentCtx } from './TournamentGate'
import styles from './CeremonyScreen.module.css'
import { IconFlame, IconGavel, IconMedal, IconReceipt, IconRings, IconSnake, IconSpoon, IconTarget, IconTrophy } from '../../components/icons'
import { celebrationColors } from '../../lib/tokens'

const C = t.ceremony

interface Step {
  id: string
  title: string
  icon: ReactNode
  /** Winners to show big, with a line each. */
  winners: Array<{ playerIds: string[]; line: string; sub?: string }>
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
      out.push({ id: 'last', title: settings.labels.lastPlace, icon: <IconSpoon size={64} />, winners: [{ playerIds: m.individual.lastPlace, line: m.individual.lastPlace.map(nameOf).join(' & ') }] })
    }
    if (m.fewestPutts) {
      const ids = Object.keys(m.fewestPutts.prizes)
      if (ids.length) {
        const row = m.fewestPutts.rows.find((r) => r.playerId === ids[0])
        out.push({ id: 'putts', title: settings.modules.fewestPutts.label, icon: <IconTarget size={64} />, winners: [{ playerIds: ids, line: ids.map(nameOf).join(' & '), sub: row ? `${row.putts} putts · ${formatMoney(m.fewestPutts.prizes[ids[0]!]!.amount)}` : undefined }] })
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
          winners: gold ? [{ playerIds: gold.playerIds, line: gold.playerIds.map(nameOf).join(' & '), sub: `${t.stats.award.snakeGold.name} · ${C.holesHeld(gold.value)}` }] : [],
          extra: (
            <div className={styles.list}>
              {rows.map(([pid, amt]) => (
                <div key={pid} className={styles.listRow}>
                  <span>{nameOf(pid)}</span>
                  <span className="num">{formatMoney(amt)}</span>
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
        out.push({ id: `best${day.roundNumber}`, title: C.steps.bestRound(settings.modules.bestRound.label, day.roundNumber), icon: <IconFlame size={64} />, winners: [{ playerIds: ids, line: ids.map(nameOf).join(' & '), sub: pts != null ? `${C.withPoints(pts)} · ${formatMoney(day.winners[ids[0]!]!.amount)}` : undefined }] })
      }
    }
    if (m.pairs) {
      const podium = m.pairs.rows.filter((r) => r.position <= settings.prizes.pairs.length)
      if (podium.length) {
        out.push({
          id: 'pairs',
          title: settings.modules.pairs.label,
          icon: <IconRings size={64} />,
          winners: [...podium].reverse().map((r) => ({ playerIds: [...r.playerIds], line: `${r.label}º · ${r.name}`, sub: `${nameOf(r.playerIds[0])} & ${nameOf(r.playerIds[1])} · ${C.withPoints(r.total)}` })),
        })
      }
    }
    if (m.individual) {
      const places = settings.prizes.stableford.length
      for (let place = places; place >= 2; place--) {
        const rows = m.individual.rows.filter((r) => r.position === place)
        if (!rows.length) continue
        out.push({ id: `place${place}`, title: C.steps.place(place), icon: <IconMedal size={64} />, winners: rows.map((r) => ({ playerIds: [r.playerId], line: nameOf(r.playerId), sub: `${C.withPoints(r.total)}${m.individual!.prizes[r.playerId] ? ` · ${formatMoney(m.individual!.prizes[r.playerId]!.amount)}` : ''}` })) })
      }
      const champs = m.individual.rows.filter((r) => r.position === 1)
      if (champs.length) {
        out.push({ id: 'champion', title: C.steps.place(1), icon: <IconTrophy size={64} />, champion: true, winners: champs.map((r) => ({ playerIds: [r.playerId], line: nameOf(r.playerId), sub: `${C.withPoints(r.total)}${m.individual!.prizes[r.playerId] ? ` · ${formatMoney(m.individual!.prizes[r.playerId]!.amount)}` : ''}` })) })
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
          <div className={styles.list}>
            {m.auction.slots.map((s, i) => (
              <div key={i} className={styles.listRow}>
                <span>
                  {s.label}: <strong>{s.playerIds.map(nameOf).join(' & ') || '–'}</strong>
                </span>
                <span className="num">{formatMoney(s.amount)}</span>
              </div>
            ))}
            <Wave className={styles.wave} />
            {payouts.map((p) => (
              <div key={p.ownerId} className={styles.listRow}>
                <span>{nameOf(p.ownerId)}</span>
                <span className="num">{formatMoney(p.amount)}</span>
              </div>
            ))}
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
        <div className={styles.list}>
          {people.map((p) => (
            <div key={p.playerId} className={styles.listRow}>
              <span>{nameOf(p.playerId)}</span>
              <span className={`num ${p.net >= 0 ? styles.pos : styles.neg}`}>{formatSignedMoney(p.net)}</span>
            </div>
          ))}
        </div>
      ),
    })
    return out
  }, [data])

  const step = idx >= 0 ? steps[idx] : undefined
  useEffect(() => {
    if (revealed && step?.champion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const colors = celebrationColors()
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 }, colors })
      const timer = setTimeout(() => confetti({ particleCount: 120, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors }), 400)
      const timer2 = setTimeout(() => confetti({ particleCount: 120, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors }), 700)
      return () => {
        clearTimeout(timer)
        clearTimeout(timer2)
      }
    }
  }, [revealed, step])

  if (!data) return null
  const { snapshot, state } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const go = (d: number) => {
    setRevealed(false)
    setIdx((i) => Math.max(-1, Math.min(steps.length, i + d)))
  }

  return (
    <div className={styles.stage}>
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
        <AnimatePresence mode="wait">
          {idx < 0 && (
            <motion.div key="start" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className={styles.hint}>{C.hint}</p>
              <button className={`btn btn--primary ${styles.bigBtn}`} type="button" onClick={() => go(1)}>
                {C.start}
              </button>
            </motion.div>
          )}
          {step && (
            <motion.div key={step.id} className={styles.center} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}>
              <span className={styles.stepIcon}>{step.icon}</span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              {!revealed ? (
                <button className={`btn btn--primary ${styles.bigBtn}`} type="button" onClick={() => setRevealed(true)}>
                  {C.reveal}
                </button>
              ) : (
                <motion.div className={styles.reveal} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}>
                  {step.winners.map((w, i) => (
                    <motion.div key={i} className={`${styles.winner} ${step.champion ? styles.champion : ''}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.6 }}>
                      <div className={styles.avatars}>
                        {w.playerIds.map((pid) => (
                          <Avatar key={pid} name={byId.get(pid)?.displayName ?? '?'} url={byId.get(pid)?.avatarUrl} size="lg" honoree={byId.get(pid)?.isHonoree} />
                        ))}
                      </div>
                      <span className={styles.winnerLine}>{w.line}</span>
                      {w.sub && <span className={styles.winnerSub}>{w.sub}</span>}
                      {step.champion && <span className={styles.trophy}>{C.champion}. {C.trophy}</span>}
                    </motion.div>
                  ))}
                  {step.extra}
                </motion.div>
              )}
            </motion.div>
          )}
          {idx >= steps.length && (
            <motion.div key="end" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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

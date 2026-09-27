/**
 * En vivo (§9.2): top strip, honoree spotlight, animated individual
 * leaderboard with "si terminara ahora" money and Calcutta owners' initials.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { PlayerSheet } from './PlayerSheet'
import { useTournamentCtx } from './TournamentGate'
import { useActiveRound } from './useMyGroup'
import styles from './LiveScreen.module.css'

export function LiveScreen() {
  const data = useTournament((s) => s.data)
  const { me } = useTournamentCtx()
  const round = useActiveRound()
  const [open, setOpen] = useState<string | null>(null)
  const prevOrder = useRef<Map<string, number>>(new Map())
  const [moves, setMoves] = useState<Map<string, number>>(new Map())

  const rows = useMemo(() => data?.state.modules.individual?.rows ?? [], [data])
  useEffect(() => {
    const next = new Map<string, number>()
    const m = new Map<string, number>()
    rows.forEach((r, i) => {
      next.set(r.playerId, i)
      const before = prevOrder.current.get(r.playerId)
      if (before != null && before !== i) m.set(r.playerId, before - i)
    })
    if (prevOrder.current.size) setMoves(m)
    prevOrder.current = next
  }, [rows])

  const money = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of data?.state.prizes ?? []) m.set(p.playerId, (m.get(p.playerId) ?? 0) + p.amount)
    return m
  }, [data])
  const owners = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!data?.state.modules.auction) return m
    for (const lot of data.state.modules.auction.lots) {
      if (lot.status !== 'sold') continue
      m.set(
        lot.playerId,
        lot.owners.map((o) => data.snapshot.players.find((p) => p.id === o.ownerId)?.displayName.slice(0, 2).toUpperCase() ?? '?'),
      )
    }
    return m
  }, [data])

  if (!data) return null
  const { snapshot, state, settings, settingsError } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const honoree = snapshot.players.find((p) => p.isHonoree)
  const honoreeRow = honoree ? rows.find((r) => r.playerId === honoree.id) : null
  const roundState = round ? state.core.rounds[round.id] : undefined
  const leadHole = roundState ? Math.max(0, ...Object.values(roundState).map((pr) => pr.thru)) : 0
  const lastHole = (pid: string) => {
    const pr = roundState?.[pid]
    if (!pr) return null
    const played = pr.holes.filter((h) => h.played)
    return played.at(-1) ?? null
  }

  return (
    <div className="screen">
      {settingsError && (
        <div className="card" style={{ background: 'var(--coral)', color: '#fff' }}>
          <strong>{t.admin.tournament.invalid}</strong>
          <p className="small">{settingsError}</p>
        </div>
      )}
      {state.flags.warnings.map((w) => (
        <p key={w} className="help coral">
          {w}
        </p>
      ))}

      <div className={styles.strip}>
        <span className="chip chip--teal">{round ? `${t.round.day(round.number)} · ${t.roundStatus[round.status]}` : t.status[snapshot.tournament.status]}</span>
        {round?.status === 'live' && leadHole > 0 && <span className="chip">{t.live.leadGroup(leadHole)}</span>}
        {state.flags.pendingSnakeTiebreaks.length > 0 && <span className="chip chip--coral">{t.live.pendingSnake(state.flags.pendingSnakeTiebreaks.length)}</span>}
      </div>

      {honoree && honoreeRow && (
        <button type="button" className={`card card--deep ${styles.spotlight}`} onClick={() => setOpen(honoree.id)}>
          <Avatar name={honoree.displayName} url={honoree.avatarUrl} size="lg" honoree />
          <div className="grow" style={{ textAlign: 'left' }}>
            <span className="label" style={{ color: 'var(--seafoam)' }}>
              {settings.labels.honoree}
            </span>
            <strong style={{ display: 'block', fontSize: '1.2rem' }}>{honoree.displayName}</strong>
            <span className="small">
              {honoreeRow.label}º · {honoreeRow.total} pts
              {round && roundState?.[honoree.id] ? ` · ${t.live.today} ${roundState[honoree.id]!.points}` : ''}
              {lastHole(honoree.id) ? ` · ${t.round.hole(lastHole(honoree.id)!.hole)}: ${lastHole(honoree.id)!.points} pts` : ''}
            </span>
          </div>
        </button>
      )}

      <h2>{settings.modules.individual.label}</h2>
      {rows.length === 0 && <p className="muted">{t.enter.noPlayers}</p>}
      <div className={styles.board}>
        <AnimatePresence initial={false}>
          {rows.map((r) => {
            const p = byId.get(r.playerId)
            if (!p) return null
            const pr = roundState?.[p.id]
            const mv = moves.get(p.id) ?? 0
            const cash = money.get(p.id) ?? 0
            const own = owners.get(p.id)
            return (
              <motion.button
                key={p.id}
                layout
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 36 }}
                className={`${styles.row} ${me.playerId === p.id ? styles.mine : ''}`}
                onClick={() => setOpen(p.id)}
              >
                <span className={`num ${styles.pos}`}>
                  {r.label}
                  <span className={`${styles.move} ${mv > 0 ? styles.up : mv < 0 ? styles.down : ''}`} aria-hidden="true">
                    {mv > 0 ? '▲' : mv < 0 ? '▼' : ''}
                  </span>
                </span>
                <Avatar name={p.displayName} url={p.avatarUrl} honoree={p.isHonoree} />
                <span className={styles.name}>
                  <strong>{p.displayName}</strong>
                  <span className={styles.sub}>
                    {p.tier && <span className="tierBadge">{p.tier}</span>}
                    {own && own.length > 0 && <span className={styles.owners}>{own.join('·')}</span>}
                    {state.core.handicaps[p.id]?.estimated && <span className="help">{t.admin.players.estimated}</span>}
                  </span>
                </span>
                <span className={styles.day}>
                  <span className={styles.dayLine}>
                    <span className="label">{t.live.thru}</span>
                    <span className="num">{pr ? t.round.thru(pr.thru) : '–'}</span>
                  </span>
                  <span className={styles.dayLine}>
                    <span className="label">{t.live.today}</span>
                    <span className="num">{pr?.points ?? 0}</span>
                  </span>
                </span>
                <span className={`num ${styles.total}`}>{r.total}</span>
                <span className={`chip ${cash > 0 ? 'chip--sun' : 'chip--outline'} ${styles.cash}`}>{formatMoney(cash)}</span>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
      <p className="help">{t.money.ifEndedNow}</p>

      <PlayerSheet playerId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

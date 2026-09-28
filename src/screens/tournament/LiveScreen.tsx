/**
 * En vivo (§9.2): the flagship board. One status line, the honoree as one
 * row detail, the individual leaderboard (points, or gross to par on a
 * toggle), and the feed. Rows re-sort once, in 200 ms.
 */
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { Board, BoardHead, EmptyState, LeaderRow, Money, Segmented, toPar, type Tone } from '../../components/primitives'
import { IconAlert } from '../../components/icons'
import { useTournament } from '../../data/tournamentStore'
import { currentHole, lastPlayedHole } from '../../lib/holes'
import type { TournamentState } from '../../engine/computeTournament'
import { ShareCardButton } from '../../components/ShareCard'
import { FeedTicker } from './FeedTicker'
import { PlayerSheet } from './PlayerSheet'
import { useTournamentCtx } from './TournamentGate'
import { useActiveRound } from './useMyGroup'
import styles from './LiveScreen.module.css'

/** Gross strokes to par over the holes actually played (pick-ups excluded). Display only. */
function grossToPar(state: TournamentState, playerId: string, roundId?: string): number | null {
  let d = 0
  let n = 0
  for (const rid of roundId ? [roundId] : state.core.roundIds) {
    for (const h of state.core.rounds[rid]?.[playerId]?.holes ?? []) {
      if (h.played && !h.pickedUp && h.gross != null) {
        d += h.gross - h.par
        n++
      }
    }
  }
  return n ? d : null
}

function useMinutesSince(ts: number): number | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return ts ? Math.max(0, Math.floor((now - ts) / 60_000)) : null
}

export function LiveScreen() {
  const data = useTournament((s) => s.data)
  const updatedAt = useTournament((s) => s.updatedAt)
  const { me } = useTournamentCtx()
  const round = useActiveRound()
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<'points' | 'gross'>('points')
  const prevOrder = useRef<Map<string, number>>(new Map())
  const [moves, setMoves] = useState<Map<string, number>>(new Map())
  const minutes = useMinutesSince(updatedAt)

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
    // The arrows mark the last re-sort only; clear them once the transition is over.
    const timer = setTimeout(() => setMoves((cur) => (cur.size ? new Map() : cur)), 600)
    return () => clearTimeout(timer)
  }, [rows])

  const owners = useMemo(() => {
    const m = new Map<string, string>()
    if (!data?.state.modules.auction) return m
    for (const lot of data.state.modules.auction.lots) {
      if (lot.status !== 'sold') continue
      m.set(lot.playerId, lot.owners.map((o) => data.snapshot.players.find((p) => p.id === o.ownerId)?.displayName.slice(0, 2).toUpperCase() ?? '?').join(' '))
    }
    return m
  }, [data])

  if (!data) return null
  const { snapshot, state, settings, settingsError } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const honoree = snapshot.players.find((p) => p.isHonoree)
  const honoreeRow = honoree ? rows.find((r) => r.playerId === honoree.id) : null
  const roundState = round ? state.core.rounds[round.id] : undefined
  // Play order matters: a group off the 10th is "on the 3rd" after hole 18 and holes 1–2.
  const groupOf = (pid: string) => (round ? snapshot.groups.find((g) => g.roundId === round.id && g.playerIds.includes(pid)) : undefined)
  const leadHole = (() => {
    if (!round || !roundState) return 0
    let best = 0
    let bestThru = -1
    for (const g of snapshot.groups.filter((x) => x.roundId === round.id)) {
      const prs = g.playerIds.map((pid) => roundState[pid]).filter((pr): pr is NonNullable<typeof pr> => !!pr)
      const thru = Math.max(0, ...prs.map((pr) => pr.thru))
      if (thru > bestThru && prs.length) {
        bestThru = thru
        const lead = prs.reduce((a, b) => (b.thru > a.thru ? b : a))
        best = thru === 0 ? 0 : currentHole(lead.holes, g.startHole, round.holes)
      }
    }
    return best
  })()
  const lastHole = (pid: string) => (roundState?.[pid] && round ? lastPlayedHole(roundState[pid]!.holes, groupOf(pid)?.startHole ?? 1, round.holes) : null)
  /** Re-sort animation only on boards small enough for it to read; big fields just re-render. */
  const animate = rows.length <= 20
  const hasHandicaps = Object.values(state.core.handicaps).some((h) => h.base > 0)

  const statusLine = round ? `${t.round.day(round.number)}, ${t.roundStatus[round.status].toLowerCase()}` : t.status[snapshot.tournament.status as keyof typeof t.status] ?? snapshot.tournament.status
  const detailLine = [round?.status === 'live' && leadHole > 0 ? t.live.leadGroup(leadHole) : null, minutes == null ? null : minutes === 0 ? t.live.updatedNow : t.live.updatedAgo(minutes)].filter(Boolean).join('. ')

  // Gross view: same players, sorted by strokes to par over the holes played. Display only.
  const grossRows = view === 'gross' ? [...rows].map((r) => ({ r, d: grossToPar(state, r.playerId) })).sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity)) : null
  const grossLabel = (i: number) => {
    if (!grossRows) return ''
    const d = grossRows[i]!.d
    let first = i
    while (first > 0 && grossRows[first - 1]!.d === d) first--
    const tied = (i > 0 && grossRows[i - 1]!.d === d) || (i < grossRows.length - 1 && grossRows[i + 1]!.d === d)
    return `${tied ? 'T' : ''}${first + 1}`
  }

  const list = grossRows ? grossRows.map((g) => g.r) : rows

  return (
    <div className={styles.screen}>
      {settingsError && (
        <div className="card card--alert">
          <strong>{t.admin.tournament.invalid}</strong>
          <p className="small">{settingsError}</p>
        </div>
      )}

      <div className={styles.strip}>
        <span className={styles.stripMain}>{statusLine}</span>
        {detailLine && <span>{detailLine}</span>}
        {state.flags.pendingSnakeTiebreaks.length > 0 && (
          <span className={styles.caution}>
            <IconAlert size={16} /> {t.live.pendingSnake(state.flags.pendingSnakeTiebreaks.length)}
          </span>
        )}
        {state.flags.warnings.map((w) => (
          <span key={w} className={styles.caution}>
            <IconAlert size={16} /> {w}
          </span>
        ))}
      </div>

      {honoree && honoreeRow && (
        <button type="button" className={styles.spotlight} onClick={() => setOpen(honoree.id)}>
          <Avatar name={honoree.displayName} url={honoree.avatarUrl} honoree />
          <span className={styles.spotlightText}>
            <span className={styles.spotlightName}>
              {settings.labels.honoree}: {honoree.displayName}
            </span>
            <span className={styles.spotlightLine}>{t.live.spotlight(honoreeRow.label, honoreeRow.total, roundState?.[honoree.id]?.points ?? null, lastHole(honoree.id)?.hole ?? null, lastHole(honoree.id)?.points ?? null)}</span>
          </span>
        </button>
      )}

      <div className={styles.boardHead}>
        <h2>{settings.modules.individual.label}</h2>
        {hasHandicaps ? (
          <Segmented
            value={view}
            options={[
              { value: 'points', label: t.live.points },
              { value: 'gross', label: t.live.gross },
            ]}
            onChange={setView}
          />
        ) : (
          <ShareCardButton what={{ kind: 'leaderboard' }} className="btn btn--ghost btn--sm" />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t.enter.noPlayers} body={t.stats.noData} />
      ) : (
        <Board>
          <BoardHead figureLabel={view === 'points' ? t.live.points : t.live.gross} dense={rows.length > 20} />
          {list.map((r, i) => {
              const p = byId.get(r.playerId)
              if (!p) return null
              const pr = roundState?.[p.id]
              const mv = moves.get(p.id) ?? 0
              const cash = state.money.people[p.id]?.prizesTotal ?? 0
              let figure: string
              let tone: Tone = 'even'
              let today: string | undefined
              if (view === 'gross') {
                const d = grossToPar(state, p.id)
                const tp = d == null ? null : toPar(d)
                figure = tp ? tp.text : '–'
                tone = tp ? tp.tone : 'even'
                const td = round ? grossToPar(state, p.id, round.id) : null
                today = td == null ? undefined : toPar(td).text
              } else {
                figure = String(r.total)
                today = pr ? String(pr.points) : undefined
              }
              const sub = (
                <span className={styles.sub}>
                  {p.tier && <span className="tierBadge">{p.tier}</span>}
                  {state.core.handicaps[p.id]?.estimated && <span>{t.admin.players.estimated}</span>}
                  {cash > 0 && (
                    <span className={styles.subMoney}>
                      <Money amount={cash} />
                    </span>
                  )}
                </span>
              )
              return (
                <motion.div key={p.id} layout={animate} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
                  <LeaderRow
                    pos={view === 'gross' ? grossLabel(i) : r.label}
                    name={p.displayName}
                    sub={sub}
                    owners={owners.get(p.id)}
                    honoree={p.isHonoree}
                    today={today}
                    thru={pr && round ? t.round.thru(pr.thru, round.holes) : undefined}
                    figure={figure}
                    tone={tone}
                    mine={me.playerId === p.id}
                    moved={mv > 0 ? 'up' : mv < 0 ? 'down' : null}
                    dense={rows.length > 20}
                    onClick={() => setOpen(p.id)}
                  />
                </motion.div>
              )
            })}
        </Board>
      )}
      <div className="row row--between">
        <span className="help">{t.money.ifEndedNow}</span>
        {hasHandicaps && <ShareCardButton what={{ kind: 'leaderboard' }} className="btn btn--ghost btn--sm" />}
      </div>

      <h2 className={styles.feedHead}>{t.feed.title}</h2>
      <FeedTicker limit={10} />

      <PlayerSheet playerId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

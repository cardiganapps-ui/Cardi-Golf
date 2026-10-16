/**
 * Stats y premios (§9.7, §12): automatic awards, the cumulative points race
 * that replays hole by hole, the pairs race, course stats and a per-player
 * table. Display only, no money.
 */
import { useCallback, useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Segmented } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { useTournament } from '../../data/tournamentStore'
import { PlayerSheet } from './PlayerSheet'
import { useTournamentCtx } from './TournamentGate'
import styles from './StatsScreen.module.css'
import { ranksPlayersByTotal, toParText } from '../../engine/formats'
import { RaceChart } from './race/RaceChart'
import type { RaceDay, RaceEntrant } from './race/raceModel'

const S = t.stats

export function StatsScreen() {
  const data = useTournament((s) => s.data)
  const { tournamentId, me } = useTournamentCtx()
  const [open, setOpen] = useState<string | null>(null)
  const [race, setRace] = useState<'players' | 'pairs'>('players')
  /** The hole of the course strip whose average shows (A11Y-20), by day. */
  const [bar, setBar] = useState<{ roundId: string; hole: number } | null>(null)

  const stats = data?.state.stats
  const players = useMemo(() => data?.snapshot.players ?? [], [data])
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const nameOf = useCallback((id: string) => byId.get(id)?.displayName ?? '?', [byId])
  /**
   * Players in board order. In a team format the board's rows are teams, so
   * each team stands for its members (keying on the rows drew «?» lines and
   * an empty table, STRAT-03).
   */
  const order = useMemo(() => {
    const ranked = data?.state.modules.individual?.rows.flatMap((r) => r.entrant.playerIds) ?? []
    return [...new Set([...ranked, ...players.map((p) => p.id)])].filter((id) => byId.has(id))
  }, [data, players, byId])
  /**
   * A player race only where one player's running total is what the board
   * ranks (Stableford, stroke play). Under match play or team play a race of
   * individual totals would crown somebody the board does not.
   */
  const playersRace = !!data && ranksPlayersByTotal(data.settings)
  const strokes = stats?.scoring !== undefined && stats.scoring !== 'points'
  const raceKind: 'players' | 'pairs' = playersRace ? race : 'pairs'

  // Race data: each entrant's cumulative figure after each hole he played, as the engine gives it.
  const series = useMemo(() => {
    const none = { entrants: [] as RaceEntrant[], stable: [] as string[], me: null as string | null, honoree: null as string | null }
    if (!data || !stats) return none
    const honoreeId = data.snapshot.players.find((p) => p.isHonoree)?.id ?? null
    if (raceKind === 'pairs' && data.state.modules.pairs) {
      const pairs = data.state.modules.pairs.rows
      // The pairs game counts Stableford points whatever the main event plays: its own race, both partners' points.
      const entrants = pairs.map((pr) => {
        const a = stats.players[pr.playerIds[0]]?.pointsRace ?? []
        const b = stats.players[pr.playerIds[1]]?.pointsRace ?? []
        const n = Math.max(a.length, b.length)
        const values: number[] = []
        for (let i = 0; i < n; i++) values.push((a[Math.min(i, a.length - 1)] ?? 0) + (b[Math.min(i, b.length - 1)] ?? 0))
        return { id: pr.pairId, label: pr.name, values }
      })
      const pairOf = (pid: string | null) => (pid ? (pairs.find((pr) => pr.playerIds.includes(pid))?.pairId ?? null) : null)
      return { entrants, stable: data.snapshot.pairs.map((p) => p.id), me: pairOf(me.playerId), honoree: pairOf(honoreeId) }
    }
    const entrants = order.filter((id) => stats.players[id]).map((id) => ({ id, label: nameOf(id), values: stats.players[id]!.race }))
    return { entrants, stable: players.map((p) => p.id), me: me.playerId, honoree: honoreeId }
  }, [data, stats, raceKind, nameOf, order, players, me.playerId])
  /** The event's days on the race's axis, as they are: 1..N of 9 or 18 holes. */
  const days = useMemo<RaceDay[]>(() => {
    if (!data) return []
    const byRound = new Map(data.snapshot.rounds.map((r) => [r.id, r]))
    return data.state.core.roundIds.flatMap((rid) => {
      const r = byRound.get(rid)
      return r ? [{ number: r.number, holes: r.holes }] : []
    })
  }, [data])
  const strokesRace = raceKind === 'players' && strokes
  const format = useMemo(() => (strokesRace ? (v: number) => toParText(v) : (v: number) => String(v)), [strokesRace])

  if (!data || !stats) return null
  const { state, settings } = data
  const hasData = Object.values(stats.players).some((s) => s.holesPlayed > 0)
  const showRace = playersRace || !!state.modules.pairs
  const net = stats.scoring === 'net'
  const avgText = (h: { avg: number; avgPoints: number }) => (strokes ? S.avgToPar(h.avg) : `${h.avgPoints} ${S.avgPoints}`)

  return (
    <div className={styles.screen}>
      <h1>{S.title}</h1>
      {!hasData && <EmptyState title={S.title} body={S.noData} />}

      {hasData && (
        <>
          <section className={styles.section}>
            <h2>{S.awards}</h2>
            <p className={styles.help}>{S.awardsHint}</p>
            <div className={styles.awards}>
              {stats.awards.map((a) => (
                <div key={a.id} className={styles.award}>
                  <span className={styles.awardName}>{S.award[a.id].name}</span>
                  <span className={styles.awardDesc}>{(strokes && S.awardStrokes[a.id]) || S.award[a.id].desc}</span>
                  <div className={styles.awardWinners}>
                    {a.playerIds.map((pid) => (
                      <button key={pid} type="button" className={styles.winner} onClick={() => setOpen(pid)}>
                        <Avatar name={nameOf(pid)} url={byId.get(pid)?.avatarUrl} size="sm" honoree={byId.get(pid)?.isHonoree} />
                        <span>{nameOf(pid)}</span>
                      </button>
                    ))}
                  </div>
                  <span className={styles.awardValue}>{S.unit(a.unit, a.value)}</span>
                </div>
              ))}
            </div>
            {(stats.moment || stats.cursedHole) && (
              <div>
                {stats.moment && (
                  <div className={styles.moment}>
                    <span className={styles.momentLabel}>{S.moment}</span>
                    <span>
                      {strokes
                        ? S.momentStrokes(nameOf(stats.moment.playerId), stats.moment.hole, stats.moment.roundNumber, stats.moment.value, net)
                        : S.momentText(nameOf(stats.moment.playerId), stats.moment.hole, stats.moment.roundNumber, stats.moment.points)}
                    </span>
                  </div>
                )}
                {stats.cursedHole && (
                  <div className={styles.moment}>
                    <span className={styles.momentLabel}>{S.cursed}</span>
                    <span>{strokes ? S.cursedStrokes(stats.cursedHole.hole, stats.cursedHole.roundNumber, stats.cursedHole.avg) : S.cursedText(stats.cursedHole.hole, stats.cursedHole.roundNumber, stats.cursedHole.avgPoints)}</span>
                  </div>
                )}
              </div>
            )}
          </section>

          {showRace && (
          <section className={styles.section}>
            <h2>{raceKind === 'pairs' ? S.pairsRace : strokes ? S.raceStrokes : S.race}</h2>
            {state.modules.pairs && playersRace && (
              <Segmented
                value={raceKind}
                options={[
                  { value: 'players', label: settings.modules.individual.label },
                  { value: 'pairs', label: settings.modules.pairs.label },
                ]}
                onChange={setRace}
                label={S.raceKind}
              />
            )}
            <RaceChart
              key={raceKind}
              title={raceKind === 'pairs' ? S.pairsRace : strokes ? S.raceStrokes : S.race}
              hint={strokesRace ? S.raceHintStrokes : S.raceHint}
              entrants={series.entrants}
              stable={series.stable}
              days={days}
              strokes={strokesRace}
              format={format}
              pairs={raceKind === 'pairs'}
              me={series.me}
              honoree={series.honoree}
              honoreeLabel={settings.labels.honoree}
              pickKey={`cardi-golf:race-pick:${tournamentId}:${raceKind}`}
            />
          </section>
          )}

          <section className={styles.section}>
            <h2>{S.course}</h2>
            <div className={styles.course}>
              {stats.rounds.filter((r) => r.holes.length > 0).map((r) => (
                <div key={r.roundId} className={styles.round}>
                  <div className={styles.roundHead}>
                    <strong>{t.round.day(r.roundNumber)}</strong>
                    <div className={styles.roundFacts}>
                      {r.hardest && (
                        <span>
                          {S.hardest}: {r.hardest.hole} ({strokes ? S.avgToPar(r.hardest.avg) : `${r.hardest.avgPoints} ${S.avgPoints}`})
                        </span>
                      )}
                      {r.easiest && (
                        <span>
                          {S.easiest}: {r.easiest.hole} ({strokes ? S.avgToPar(r.easiest.avg) : `${r.easiest.avgPoints} ${S.avgPoints}`})
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Each hole's average was a title attribute, out of reach on a phone and of most screen readers (A11Y-20): a tap shows it, and the button says it. */}
                  <div className={styles.holeBars}>
                    {r.holes.map((h) => {
                      const said = S.raceChart.holeBar(t.round.hole(h.hole), h.par, avgText(h))
                      const on = bar?.roundId === r.roundId && bar.hole === h.hole
                      return (
                        <button key={h.hole} type="button" className={styles.holeBar} aria-label={said} aria-pressed={on} onClick={() => setBar(on ? null : { roundId: r.roundId, hole: h.hole })}>
                          {/* Taller is easier: more points, or fewer strokes against par (two under reads as four points). */}
                          <span className={`${styles.bar} ${h.hole === r.hardest?.hole ? styles.barHard : h.hole === r.easiest?.hole ? styles.barEasy : ''}`} style={{ height: `${Math.max(0, Math.min(100, ((strokes ? 2 - h.avg : h.avgPoints) / 4) * 100))}%` }} />
                          <span className={styles.holeLabel}>{h.hole}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className={styles.barReadout}>
                    {(() => {
                      const h = bar?.roundId === r.roundId ? r.holes.find((x) => x.hole === bar.hole) : undefined
                      return h ? S.raceChart.holeBar(t.round.hole(h.hole), h.par, avgText(h)) : S.raceChart.holeBarHint
                    })()}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2>{S.perPlayer}</h2>
            <div className={styles.tableWrap}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.games.player}</th>
                    <th className="num">{S.holesPlayed}</th>
                    <th className="num">{S.birdiesGross}</th>
                    <th className="num">{S.birdiesNet}</th>
                    <th className="num">{S.pars}</th>
                    <th className="num">{S.bogeys}</th>
                    <th className="num">{S.worse}</th>
                    <th className="num">{S.pickUps}</th>
                    <th className="num">{S.putts}</th>
                    <th className="num">{S.puttsPerHole}</th>
                    <th className="num">{S.onePutts}</th>
                    <th className="num">{S.threePutts}</th>
                    {state.modules.snake && <th className="num">{S.snakeHoles}</th>}
                    <th className="num">{S.streak}</th>
                    <th className="num">{strokes ? S.byParStrokes : S.byPar}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.map((pid) => {
                    const s = stats.players[pid]
                    if (!s) return null
                    return (
                      <tr key={pid}>
                        <td>
                          <button type="button" className={styles.rowBtn} onClick={() => setOpen(pid)}>
                            <strong>{nameOf(pid)}</strong>
                          </button>
                        </td>
                        <td className="num">{s.holesPlayed}</td>
                        <td className="num">{s.grossBirdies}</td>
                        <td className="num">{s.netBirdies}</td>
                        <td className="num">{s.pars}</td>
                        <td className="num">{s.bogeys}</td>
                        <td className="num">{s.doubleOrWorse}</td>
                        <td className="num">{s.pickUps}</td>
                        <td className="num">{s.putts}</td>
                        <td className="num">{s.puttsPerHole ?? '–'}</td>
                        <td className="num">{s.onePutts}</td>
                        <td className="num">{s.threePutts}</td>
                        {state.modules.snake && <td className="num">{s.snakeHoles}</td>}
                        <td className="num">{s.longestStreak}</td>
                        <td className="num">
                          {strokes ? `${S.signed(s.valueByPar[3])} / ${S.signed(s.valueByPar[4])} / ${S.signed(s.valueByPar[5])}` : `${s.pointsByPar[3]} / ${s.pointsByPar[4]} / ${s.pointsByPar[5]}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <PlayerSheet playerId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

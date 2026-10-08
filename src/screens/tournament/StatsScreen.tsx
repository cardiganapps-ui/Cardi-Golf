/**
 * Stats y premios (§9.7, §12): automatic awards, the cumulative points race
 * that replays hole by hole, the pairs race, course stats and a per-player
 * table. Display only, no money.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { t } from '../../i18n/es-MX'
import { Avatar, Segmented } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { cssVar } from '../../lib/tokens'
import { useTournament } from '../../data/tournamentStore'
import { PlayerSheet } from './PlayerSheet'
import styles from './StatsScreen.module.css'
import { IconPlay, IconStop } from '../../components/icons'
import { chartSeries } from '../../lib/tokens'
import { ranksPlayersByTotal, toParText } from '../../engine/formats'

const S = t.stats

export function StatsScreen() {
  const data = useTournament((s) => s.data)
  const PALETTE = useMemo(() => chartSeries(), [])
  const ink = useMemo(() => ({ rule: cssVar('--rule'), ink2: cssVar('--ink-2'), surface: cssVar('--surface-2') }), [])
  const [open, setOpen] = useState<string | null>(null)
  const [race, setRace] = useState<'players' | 'pairs'>('players')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState<number | null>(null)

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

  // Race data: one point per hole index (1..N), each series = cumulative points.
  const series = useMemo(() => {
    if (!data || !stats) return { rows: [] as Array<Record<string, number>>, keys: [] as Array<{ key: string; label: string }> }
    if (raceKind === 'pairs' && data.state.modules.pairs) {
      const pairs = data.state.modules.pairs.rows
      // The pairs game counts Stableford points whatever the main event plays: its own race.
      const n = Math.max(0, ...pairs.map((pr) => Math.max(stats.players[pr.playerIds[0]]?.pointsRace.length ?? 0, stats.players[pr.playerIds[1]]?.pointsRace.length ?? 0)))
      const rows: Array<Record<string, number>> = []
      for (let i = 0; i < n; i++) {
        const row: Record<string, number> = { hole: i + 1 }
        for (const pr of pairs) {
          const a = stats.players[pr.playerIds[0]]?.pointsRace ?? []
          const b = stats.players[pr.playerIds[1]]?.pointsRace ?? []
          row[pr.pairId] = (a[Math.min(i, a.length - 1)] ?? 0) + (b[Math.min(i, b.length - 1)] ?? 0)
        }
        rows.push(row)
      }
      return { rows, keys: pairs.map((pr) => ({ key: pr.pairId, label: pr.name })) }
    }
    const list = Object.values(stats.players)
    const n = Math.max(0, ...list.map((s) => s.race.length))
    const rows: Array<Record<string, number>> = []
    for (let i = 0; i < n; i++) {
      const row: Record<string, number> = { hole: i + 1 }
      for (const s of list) if (i < s.race.length) row[s.playerId] = s.race[i]!
      rows.push(row)
    }
    return { rows, keys: order.filter((id) => stats.players[id]).map((id) => ({ key: id, label: nameOf(id) })) }
  }, [data, stats, raceKind, nameOf, order])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setCursor((c) => {
        const next = (c ?? 0) + 1
        if (next >= series.rows.length) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 250)
    return () => clearInterval(timer)
  }, [playing, series.rows.length])

  if (!data || !stats) return null
  const { state, settings } = data
  const visible = cursor == null ? series.rows : series.rows.slice(0, cursor + 1)
  const hasData = Object.values(stats.players).some((s) => s.holesPlayed > 0)
  const showRace = playersRace || !!state.modules.pairs
  const net = stats.scoring === 'net'

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
            <div className={styles.sectionHead}>
              <h2>{raceKind === 'pairs' ? S.pairsRace : strokes ? S.raceStrokes : S.race}</h2>
              <button
                className="btn btn--secondary btn--sm"
                type="button"
                onClick={() => {
                  if (playing) {
                    setPlaying(false)
                    setCursor(null)
                  } else {
                    setCursor(0)
                    setPlaying(true)
                  }
                }}
              >
                {playing ? <IconStop size={18} /> : <IconPlay size={18} />} {playing ? S.stop : S.play}
              </button>
            </div>
            {state.modules.pairs && playersRace && (
              <Segmented
                value={raceKind}
                options={[
                  { value: 'players', label: settings.modules.individual.label },
                  { value: 'pairs', label: settings.modules.pairs.label },
                ]}
                onChange={(v) => {
                  setRace(v)
                  setCursor(null)
                  setPlaying(false)
                }}
              />
            )}
            <p className={styles.help}>{raceKind === 'players' && strokes ? S.raceHintStrokes : S.raceHint}</p>
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={visible} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={ink.rule} vertical={false} />
                  <XAxis dataKey="hole" type="number" domain={[1, Math.max(2, series.rows.length)]} tick={{ fontSize: 11, fill: ink.ink2 }} axisLine={{ stroke: ink.rule }} tickLine={false} allowDecimals={false} />
                  {/* Under strokes fewer is better, so the axis runs the other way: the leader is on top. */}
                  <YAxis
                    reversed={raceKind === 'players' && strokes}
                    tickFormatter={raceKind === 'players' && strokes ? (v: number) => toParText(v) : undefined}
                    tick={{ fontSize: 11, fill: ink.ink2 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ background: ink.surface, border: `1px solid ${ink.rule}`, borderRadius: 4, fontSize: 12 }}
                    labelFormatter={(h) => `${t.round.hole(Number(h))}`}
                    formatter={raceKind === 'players' && strokes ? (v) => toParText(Number(v)) : undefined}
                  />
                  {series.keys.map((k, i) => (
                    <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={PALETTE[i % PALETTE.length]} strokeWidth={i < 3 ? 3 : 1.5} dot={false} isAnimationActive={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.legend}>
              {series.keys.map((k, i) => (
                <span key={k.key} className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: PALETTE[i % PALETTE.length] }} />
                  {k.label}
                </span>
              ))}
            </div>
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
                  <div className={styles.holeBars}>
                    {r.holes.map((h) => (
                      <div key={h.hole} className={styles.holeBar} title={`${t.round.hole(h.hole)}, par ${h.par}, ${strokes ? S.avgToPar(h.avg) : h.avgPoints}`}>
                        {/* Taller is easier: more points, or fewer strokes against par (two under reads as four points). */}
                        <div className={`${styles.bar} ${h.hole === r.hardest?.hole ? styles.barHard : h.hole === r.easiest?.hole ? styles.barEasy : ''}`} style={{ height: `${Math.max(0, Math.min(100, ((strokes ? 2 - h.avg : h.avgPoints) / 4) * 100))}%` }} />
                        <span className={styles.holeLabel}>{h.hole}</span>
                      </div>
                    ))}
                  </div>
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

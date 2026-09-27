/**
 * Stats y premios (§9.7, §12): automatic awards, the cumulative points race
 * that replays hole by hole, the pairs race, course stats and a per-player
 * table. Display only, no money.
 */
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { t } from '../../i18n/es-MX'
import { Avatar, Segmented } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { PlayerSheet } from './PlayerSheet'
import styles from './StatsScreen.module.css'

const S = t.stats
const PALETTE = ['#0F6E77', '#B04327', '#F2B63F', '#3AA6AE', '#12343B', '#8C6D1F', '#5B8C5A', '#A05C8C', '#4F6166', '#C97B3A', '#2E5E8C', '#7A3E3E']

export function StatsScreen() {
  const data = useTournament((s) => s.data)
  const [open, setOpen] = useState<string | null>(null)
  const [race, setRace] = useState<'players' | 'pairs'>('players')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState<number | null>(null)

  const stats = data?.state.stats
  const players = useMemo(() => data?.snapshot.players ?? [], [data])
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const nameOf = (id: string) => byId.get(id)?.displayName ?? '?'

  // Race data: one point per hole index (1..N), each series = cumulative points.
  const series = useMemo(() => {
    if (!data || !stats) return { rows: [] as Array<Record<string, number>>, keys: [] as Array<{ key: string; label: string }> }
    if (race === 'pairs' && data.state.modules.pairs) {
      const pairs = data.state.modules.pairs.rows
      const n = Math.max(0, ...pairs.map((pr) => Math.max(stats.players[pr.playerIds[0]]?.race.length ?? 0, stats.players[pr.playerIds[1]]?.race.length ?? 0)))
      const rows: Array<Record<string, number>> = []
      for (let i = 0; i < n; i++) {
        const row: Record<string, number> = { hole: i + 1 }
        for (const pr of pairs) {
          const a = stats.players[pr.playerIds[0]]?.race ?? []
          const b = stats.players[pr.playerIds[1]]?.race ?? []
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
    const order = data.state.modules.individual?.rows.map((r) => r.playerId) ?? list.map((s) => s.playerId)
    return { rows, keys: order.map((id) => ({ key: id, label: nameOf(id) })) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stats, race])

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

  return (
    <div className="screen">
      <h1>{S.title}</h1>
      {!hasData && <p className="muted">{S.noData}</p>}

      {hasData && (
        <>
          <section className="stack">
            <h2>{S.awards}</h2>
            <p className="help">{S.awardsHint}</p>
            <div className={styles.awards}>
              {stats.awards.map((a) => (
                <div key={a.id} className={`card card--cell ${styles.award}`}>
                  <span className={styles.awardName}>{S.award[a.id].name}</span>
                  <span className="help">{S.award[a.id].desc}</span>
                  <div className={styles.awardWinners}>
                    {a.playerIds.map((pid) => (
                      <button key={pid} type="button" className={styles.winner} onClick={() => setOpen(pid)}>
                        <Avatar name={nameOf(pid)} url={byId.get(pid)?.avatarUrl} size="sm" honoree={byId.get(pid)?.isHonoree} />
                        <span>{nameOf(pid)}</span>
                      </button>
                    ))}
                    <span className={`num ${styles.awardValue}`}>{S.unit(a.unit, a.value)}</span>
                  </div>
                </div>
              ))}
              {stats.moment && (
                <div className={`card card--deep ${styles.award}`}>
                  <span className={styles.awardName} style={{ color: 'var(--sun)' }}>
                    {S.moment}
                  </span>
                  <span>{S.momentText(nameOf(stats.moment.playerId), stats.moment.hole, stats.moment.roundNumber, stats.moment.points)}</span>
                </div>
              )}
              {stats.cursedHole && (
                <div className={`card ${styles.award}`} style={{ background: 'var(--coral)', color: '#fff' }}>
                  <span className={styles.awardName}>{S.cursed}</span>
                  <span>{S.cursedText(stats.cursedHole.hole, stats.cursedHole.roundNumber, stats.cursedHole.avgPoints)}</span>
                </div>
              )}
            </div>
          </section>

          <section className="stack">
            <div className="row row--between">
              <h2>{race === 'pairs' ? S.pairsRace : S.race}</h2>
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
                {playing ? `■ ${S.stop}` : `▶ ${S.play}`}
              </button>
            </div>
            {state.modules.pairs && (
              <Segmented
                value={race}
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
            <p className="help">{S.raceHint}</p>
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={visible} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--hair)" strokeDasharray="3 3" />
                  <XAxis dataKey="hole" type="number" domain={[1, Math.max(2, series.rows.length)]} tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--cell)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12 }} labelFormatter={(h) => `${t.round.hole(Number(h))}`} />
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

          <section className="stack">
            <h2>{S.course}</h2>
            {stats.rounds.filter((r) => r.holes.length > 0).map((r) => (
              <div key={r.roundId} className="card card--cell stack" style={{ padding: 12 }}>
                <strong>{t.round.day(r.roundNumber)}</strong>
                <div className="row row--wrap small">
                  {r.hardest && (
                    <span>
                      🪦 {S.hardest}: <strong>{r.hardest.hole}</strong> ({r.hardest.avgPoints} {S.avgPoints})
                    </span>
                  )}
                  {r.easiest && (
                    <span>
                      🍰 {S.easiest}: <strong>{r.easiest.hole}</strong> ({r.easiest.avgPoints} {S.avgPoints})
                    </span>
                  )}
                </div>
                <div className={styles.holeBars}>
                  {r.holes.map((h) => (
                    <div key={h.hole} className={styles.holeBar} title={`${t.round.hole(h.hole)} · par ${h.par} · ${h.avgPoints}`}>
                      <div className={styles.bar} style={{ height: `${Math.min(100, (h.avgPoints / 4) * 100)}%` }} />
                      <span className={styles.holeLabel}>{h.hole}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="stack">
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
                    <th className="num">{S.byPar}</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.modules.individual?.rows.map((r) => r.playerId) ?? players.map((p) => p.id)).map((pid) => {
                    const s = stats.players[pid]
                    if (!s) return null
                    return (
                      <tr key={pid} onClick={() => setOpen(pid)}>
                        <td>
                          <strong>{nameOf(pid)}</strong>
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
                          {s.pointsByPar[3]} / {s.pointsByPar[4]} / {s.pointsByPar[5]}
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

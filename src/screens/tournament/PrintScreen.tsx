/**
 * Printable fallback scorecards (§16 M7): one card per group per round with
 * the stroke dots each player receives on every hole. Print → save as PDF.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Segmented } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { playOrder } from '../../engine/core/playOrder'
import { useTournamentCtx } from './TournamentGate'
import { useActiveRound } from './useMyGroup'
import styles from './PrintScreen.module.css'
import { IconPrint } from '../../components/icons'

const P = t.print

export function PrintScreen() {
  const data = useTournament((s) => s.data)
  const { slug } = useTournamentCtx()
  const active = useActiveRound()
  const [roundId, setRoundId] = useState<string | null>(null)
  if (!data) return null
  const { snapshot, state } = data
  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled')
  const current = rounds.find((r) => r.id === (roundId ?? active?.id)) ?? rounds[0]
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const groups = current ? snapshot.groups.filter((g) => g.roundId === current.id) : []
  const pairName = (pid: string) => {
    const pair = snapshot.pairs.find((x) => x.player1Id === pid || x.player2Id === pid)
    return pair?.name ?? null
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} noprint`}>
        <Link to={`/t/${slug}/admin/datos`} className="btn btn--ghost btn--sm">
          {t.common.back}
        </Link>
        {rounds.length > 1 && <Segmented value={current?.id ?? ''} options={rounds.map((r) => ({ value: r.id, label: t.round.day(r.number) }))} onChange={setRoundId} />}
        <button className="btn btn--primary btn--sm" type="button" onClick={() => window.print()}>
          <IconPrint /> {P.print}
        </button>
      </div>
      {!current && <p className="muted">{t.live.noRounds}</p>}
      {current && groups.length === 0 && <p className="muted">{P.noGroups}</p>}
      {current &&
        groups.map((g) => {
          const order = playOrder(g.startHole, current.holes)
          const members = g.playerIds.map((pid) => ({ p: byId.get(pid)!, pr: state.core.rounds[current.id]?.[pid] })).filter((m) => m.p)
          const ref = members[0]?.pr
          return (
            <section key={g.id} className={styles.card}>
              <header className={styles.head}>
                {snapshot.tournament.logoUrl && <img src={snapshot.tournament.logoUrl} alt="" className={styles.logo} />}
                <div className="grow">
                  <h1 className={styles.title}>{snapshot.tournament.name}</h1>
                  <div className={styles.sub}>
                    {t.round.day(current.number)}
                    {current.date ? ` · ${current.date}` : ''} · {t.card.group} {g.number}
                    {g.teeTime ? ` · ${g.teeTime.slice(0, 5)}` : ''} · {P.startHole(g.startHole)}
                  </div>
                </div>
              </header>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.left}>{P.hole}</th>
                    {order.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                    <th>{t.common.total}</th>
                  </tr>
                  <tr className={styles.meta}>
                    <th className={styles.left}>{P.par}</th>
                    {order.map((h) => (
                      <th key={h}>{ref?.holes.find((x) => x.hole === h)?.par ?? ''}</th>
                    ))}
                    <th>{ref ? ref.holes.reduce((a, h) => a + h.par, 0) : ''}</th>
                  </tr>
                  <tr className={styles.meta}>
                    <th className={styles.left}>{P.si}</th>
                    {order.map((h) => (
                      <th key={h}>{ref?.holes.find((x) => x.hole === h)?.strokeIndex ?? ''}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {members.map(({ p, pr }) => (
                    <PlayerRows key={p.id} name={p.displayName} sub={`${t.live.playingHcp} ${pr?.playingHcp ?? '–'}${pairName(p.id) ? ` · ${pairName(p.id)}` : ''}`} dots={order.map((h) => pr?.holes.find((x) => x.hole === h)?.strokesReceived ?? 0)} />
                  ))}
                </tbody>
              </table>
              <footer className={styles.foot}>
                <span>{P.legend}</span>
                <span>
                  {P.sign}: ______________________ · ______________________
                </span>
              </footer>
            </section>
          )
        })}
    </div>
  )
}

function PlayerRows({ name, sub, dots }: { name: string; sub: string; dots: number[] }) {
  return (
    <>
      <tr className={styles.player}>
        <td className={styles.left} rowSpan={2}>
          <strong>{name}</strong>
          <span className={styles.playerSub}>{sub}</span>
        </td>
        {dots.map((d, i) => (
          <td key={i} className={styles.strokes}>
            <span className={styles.dots}>{'•'.repeat(d)}</span>
          </td>
        ))}
        <td />
      </tr>
      <tr className={styles.putts}>
        {dots.map((_, i) => (
          <td key={i} />
        ))}
        <td />
      </tr>
    </>
  )
}

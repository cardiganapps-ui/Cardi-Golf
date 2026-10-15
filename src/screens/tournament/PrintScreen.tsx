/**
 * Printable fallback scorecards (§16 M7): one card per group per round with
 * the stroke dots each player receives on every hole. Print → save as PDF.
 *
 * With the Calcutta on, also its sheet (DB-19): the console needs the server
 * for every bid, so a night without it runs on paper and the console takes it
 * afterwards. `?hoja=calcutta` opens it (the console links there).
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Segmented } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { playOrder } from '../../engine/core/playOrder'
import { useTournamentCtx } from './TournamentGate'
import { useActiveRound } from './useMyGroup'
import styles from './PrintScreen.module.css'
import { IconPrint } from '../../components/icons'
import { TournamentLogo } from '../../components/TournamentLogo'
import { formatMoney } from '../../lib/money'
import type { TournamentData } from '../../data/tournamentStore'

const P = t.print

export function PrintScreen() {
  const data = useTournament((s) => s.data)
  const { slug } = useTournamentCtx()
  const active = useActiveRound()
  const [roundId, setRoundId] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  if (!data) return null
  const { snapshot, state } = data
  const auction = data.settings.modules.auction.enabled
  const sheet = auction && params.get('hoja') === 'calcutta'
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
        {auction && (
          <Segmented
            value={sheet ? 'calcutta' : 'cards'}
            options={[
              { value: 'cards', label: P.cards },
              { value: 'calcutta', label: P.auctionSheet },
            ]}
            onChange={(v) => setParams(v === 'calcutta' ? { hoja: 'calcutta' } : {}, { replace: true })}
          />
        )}
        {!sheet && rounds.length > 1 && <Segmented value={current?.id ?? ''} options={rounds.map((r) => ({ value: r.id, label: t.round.day(r.number) }))} onChange={setRoundId} />}
        <button className="btn btn--primary btn--sm" type="button" onClick={() => window.print()}>
          <IconPrint /> {P.print}
        </button>
      </div>
      {sheet && <AuctionSheet data={data} />}
      {!sheet && !current && <p className="help">{t.live.noRounds}</p>}
      {!sheet && current && groups.length === 0 && <p className="help">{P.noGroups}</p>}
      {!sheet &&
        current &&
        groups.map((g) => {
          const order = playOrder(g.startHole, current.holes)
          const members = g.playerIds.map((pid) => ({ p: byId.get(pid)!, pr: state.core.rounds[current.id]?.[pid] })).filter((m) => m.p)
          const ref = members[0]?.pr
          return (
            <section key={g.id} className={styles.card}>
              <header className={styles.head}>
                {snapshot.tournament.logoUrl && <TournamentLogo url={snapshot.tournament.logoUrl} className={styles.logo} />}
                <div className="grow">
                  <h1 className={styles.title}>{snapshot.tournament.name}</h1>
                  <div className={styles.sub}>
                    {t.round.day(current.number)}
                    {current.date ? `, ${new Date(`${current.date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}, {t.card.group} {g.number}
                    {g.teeTime ? `, ${g.teeTime.slice(0, 5)}` : ''}, {P.startHole(g.startHole)}
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
                    <PlayerRows key={p.id} name={p.displayName} sub={`${t.live.playingHcp} ${pr?.playingHcp ?? '–'}${pairName(p.id) ? `, ${pairName(p.id)}` : ''}`} dots={order.map((h) => pr?.holes.find((x) => x.hole === h)?.strokesReceived ?? 0)} />
                  ))}
                </tbody>
              </table>
              <footer className={styles.foot}>
                <span>{P.legend}</span>
                <span>
                  {P.sign}: ______________________ / ______________________
                </span>
              </footer>
            </section>
          )
        })}
    </div>
  )
}

/**
 * The Calcutta on paper: the lots in the order drawn (the players in order when nothing is drawn yet, the lot left to
 * write), with what is sold already filled in and a blank line for the rest.
 */
function AuctionSheet({ data }: { data: TournamentData }) {
  const { snapshot, settings } = data
  const a = settings.auction
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const lots = [...snapshot.calcuttaLots].sort((x, y) => x.lotNumber - y.lotNumber)
  const rows = lots.length
    ? lots.map((l) => {
        const sold = l.status === 'sold'
        return { key: l.id, lot: String(l.lotNumber), player: byId.get(l.playerId), buyer: sold && l.ownerId ? (byId.get(l.ownerId)?.displayName ?? '') : '', price: sold && l.price != null ? formatMoney(l.price) : '' }
      })
    : [...snapshot.players].sort((x, y) => x.sortOrder - y.sortOrder).map((p) => ({ key: p.id, lot: '', player: p, buyer: '', price: '' }))
  return (
    <section className={styles.card}>
      <header className={styles.head}>
        {snapshot.tournament.logoUrl && <TournamentLogo url={snapshot.tournament.logoUrl} className={styles.logo} />}
        <div className="grow">
          <h1 className={styles.title}>{snapshot.tournament.name}</h1>
          <div className={styles.sub}>{P.auctionSheet}</div>
        </div>
      </header>
      <p className={styles.sub}>{P.auctionRules(formatMoney(a.openingBid), formatMoney(a.increment), a.maxPlayersPerOwner, a.selfOwnedCountsTowardMax, a.buybackMaxPct)}</p>
      <table className={`${styles.table} ${styles.sheet}`}>
        <thead>
          <tr>
            <th className={styles.lot}>{P.lot}</th>
            <th className={styles.left}>{P.player}</th>
            <th className={styles.left}>{P.buyer}</th>
            <th>{P.price}</th>
            <th>{P.buyback}</th>
            <th className={styles.lot}>{P.paid}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={styles.lot}>{r.lot}</td>
              <td className={styles.left}>
                <strong>{r.player?.displayName ?? ''}</strong>
                {r.player?.tier && <span className={styles.playerSub}>{t.tv.tier(r.player.tier)}</span>}
              </td>
              <td className={styles.left}>{r.buyer}</td>
              <td>{r.price}</td>
              <td />
              <td className={styles.lot} />
            </tr>
          ))}
        </tbody>
      </table>
      <footer className={styles.foot}>
        <span>{P.pot}: ______________________</span>
        <span>{P.auctionAfter}</span>
      </footer>
    </section>
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

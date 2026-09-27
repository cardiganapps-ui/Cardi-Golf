/**
 * Jugador (§9.5): both cards, playing handicap with its explanation, pair,
 * owners, money so far and basic stats.
 */
import { useMemo } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { Avatar, Sheet } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney, formatSignedMoney } from '../../lib/money'
import styles from './PlayerSheet.module.css'

export function PlayerSheet({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const data = useTournament((s) => s.data)
  const p = data?.snapshot.players.find((x) => x.id === playerId)
  const money = useMemo(() => (playerId && data ? data.state.prizes.filter((x) => x.playerId === playerId) : []), [data, playerId])
  const rounds = useMemo(
    () => (data && p ? data.state.core.roundIds.map((rid) => ({ round: data.snapshot.rounds.find((r) => r.id === rid)!, pr: data.state.core.rounds[rid]?.[p.id] })) : []),
    [data, p],
  )
  const stats = useMemo(() => {
    let birdies = 0
    let netBirdies = 0
    let pars = 0
    let bogeys = 0
    let worse = 0
    let pickups = 0
    for (const { pr } of rounds) {
      for (const h of pr?.holes ?? []) {
        if (!h.played) continue
        if (h.pickedUp) {
          pickups++
          continue
        }
        if (h.gross != null && h.gross - h.par <= -1) birdies++
        if (h.points >= 3) netBirdies++
        else if (h.points === 2) pars++
        else if (h.points === 1) bogeys++
        else worse++
      }
    }
    return { birdies, netBirdies, pars, bogeys, worse, pickups }
  }, [rounds])
  if (!data || !p) return null
  const { snapshot, state, settings } = data
  const pair = snapshot.pairs.find((x) => x.player1Id === p.id || x.player2Id === p.id)
  const partner = pair ? snapshot.players.find((x) => x.id === (pair.player1Id === p.id ? pair.player2Id : pair.player1Id)) : null
  const auction = state.modules.auction
  const myLot = auction?.lots.find((l) => l.playerId === p.id && l.status === 'sold')
  const owned = auction?.lots.filter((l) => l.status === 'sold' && l.owners.some((o) => o.ownerId === p.id)) ?? []
  const person = state.money.people[p.id]
  const nameOf = (id: string) => snapshot.players.find((x) => x.id === id)?.displayName ?? '?'
  const row = state.modules.individual?.rows.find((r) => r.playerId === p.id)
  const hc = state.core.handicaps[p.id]
  const totals = state.core.totals[p.id]
  const putts = state.modules.fewestPutts?.rows.find((r) => r.playerId === p.id)

  return (
    <Sheet open={!!playerId} onClose={onClose} wide>
      <div className="stack stack--lg">
        <div className="row">
          <Avatar name={p.displayName} url={p.avatarUrl} size="lg" honoree={p.isHonoree} />
          <div className="grow">
            <h2>{p.fullName}</h2>
            <span className="help">
              {p.tier && <span className="tierBadge" style={{ marginRight: 6 }}>{p.tier}</span>}
              {row ? `${row.label}º · ${row.total} pts` : ''}
              {totals ? ` · ${t.live.thru} ${totals.thru}` : ''}
            </span>
          </div>
        </div>

        <section className="card card--cell stack" style={{ padding: 12 }}>
          <div className="row row--between">
            <span className="label">{t.admin.players.handicap}</span>
            {hc && <HowCalculated why={[hc.why, ...rounds.filter((r) => r.pr).map((r) => r.pr!.playingHcpWhy)]} />}
          </div>
          <div className="row row--wrap">
            <span className="chip">{hc?.source === 'manual' ? t.admin.players.baseHcp : t.admin.players.index}: {hc?.base ?? p.baseHcp}</span>
            {rounds.map(({ round, pr }) =>
              pr ? (
                <span key={round.id} className={`chip ${pr.overridden ? 'chip--coral' : 'chip--teal'}`}>
                  {t.round.day(round.number)}: {pr.playingHcp}
                  {pr.cut ? ` (−${pr.cut})` : ''}
                </span>
              ) : null,
            )}
            {hc?.estimated && <span className="chip chip--sun">{t.admin.players.estimated}</span>}
          </div>
        </section>

        {rounds.map(({ round, pr }) =>
          pr ? (
            <section key={round.id} className="stack">
              <div className="row row--between">
                <h3>
                  {t.round.day(round.number)} · {pr.points} pts
                </h3>
                <span className="help">
                  {pr.gross != null ? `${t.player.gross} ${pr.gross} · ` : ''}
                  {t.player.putts} {pr.putts}
                </span>
              </div>
              <div className={styles.cardWrap}>
                <table className={`table ${styles.card}`}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Par</th>
                      <th>SI</th>
                      <th>{t.player.strokesShort}</th>
                      <th>{t.player.grossShort}</th>
                      <th>{t.player.netShort}</th>
                      <th>Pts</th>
                      <th>{t.player.puttsShort}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.holes.map((h) => (
                      <tr key={h.hole} className={!h.played ? styles.unplayed : h.points >= 3 ? styles.birdie : h.points === 0 && h.played ? styles.zero : ''}>
                        <td className="num">{h.hole}</td>
                        <td className="num">{h.par}</td>
                        <td className="num">{h.strokeIndex}</td>
                        <td className={styles.dots}>{'•'.repeat(h.strokesReceived)}</td>
                        <td className="num">{h.pickedUp ? 'L' : (h.gross ?? '')}</td>
                        <td className="num">{h.net ?? ''}</td>
                        <td className="num">
                          {h.played ? (
                            <HowCalculated why={h.why} label={String(h.points)}>
                              <strong>{h.points}</strong>
                            </HowCalculated>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="num">{h.putts ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null,
        )}

        {(pair || myLot || owned.length > 0) && (
          <section className="card card--cell stack" style={{ padding: 12 }}>
            {pair && partner && (
              <p>
                <span className="label">{settings.modules.pairs.label}</span>
                <br />
                {pair.name ? `${pair.name} · ` : ''}
                {t.player.partner}: <strong>{partner.displayName}</strong>
              </p>
            )}
            {myLot && (
              <p>
                <span className="label">{settings.modules.auction.label}</span>
                <br />
                {t.player.ownedBy}: {myLot.owners.map((o) => `${nameOf(o.ownerId)} ${o.pct}%`).join(', ')} · {formatMoney(myLot.price)}
              </p>
            )}
            {owned.length > 0 && (
              <p className="small">
                {t.player.owns}: {owned.map((l) => `${nameOf(l.playerId)} (${l.owners.find((o) => o.ownerId === p.id)!.pct}%)`).join(', ')}
              </p>
            )}
          </section>
        )}

        <section className="card stack" style={{ padding: 12 }}>
          <span className="label">{t.nav.money}</span>
          {money.length === 0 && <p className="help">{t.player.noMoneyYet}</p>}
          {money.map((m, i) => (
            <div key={i} className="row row--between small">
              <span>
                {m.label}
                {!m.final && <span className="help"> · {t.money.ifEndedNow}</span>}
              </span>
              <HowCalculated why={m.why} label={formatMoney(m.amount)} />
            </div>
          ))}
          {person && (
            <div className="row row--between" style={{ borderTop: '1px solid var(--hair)', paddingTop: 8 }}>
              <span>
                {t.money.paid} {formatMoney(person.paid)} · {t.money.receives} {formatMoney(person.receives)}
              </span>
              <strong className={person.net >= 0 ? 'teal' : 'coral'}>{formatSignedMoney(person.net)}</strong>
            </div>
          )}
        </section>

        <section className="card card--cell" style={{ padding: 12 }}>
          <span className="label">{t.player.stats}</span>
          <div className={styles.stats}>
            <Stat label={t.player.birdies} v={stats.birdies} />
            <Stat label={t.player.netBirdies} v={stats.netBirdies} />
            <Stat label={t.player.pars} v={stats.pars} />
            <Stat label={t.player.bogeys} v={stats.bogeys} />
            <Stat label={t.player.worse} v={stats.worse} />
            <Stat label={t.player.pickups} v={stats.pickups} />
            {putts && <Stat label={t.player.puttsAvg} v={putts.average} />}
            {putts && <Stat label={t.player.onePutts} v={putts.onePutts} />}
            {putts && <Stat label={t.player.threePutts} v={putts.threePutts} />}
            {state.modules.snake && <Stat label={t.player.snakeHoles} v={state.modules.snake.holesHeld[p.id] ?? 0} />}
          </div>
        </section>
      </div>
    </Sheet>
  )
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className={styles.stat}>
      <span className="num" style={{ fontSize: '1.3rem' }}>
        {v}
      </span>
      <span className="help">{label}</span>
    </div>
  )
}

/**
 * Juegos (§9.4): one sub-tab per enabled module, labels from settings.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { Avatar, Segmented } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import type { ModuleId } from '../../engine/settings/schema'
import { formatMoney } from '../../lib/money'
import { PlayerSheet } from './PlayerSheet'
import { SnakeBoard } from './SnakeBoard'
import styles from './GamesScreen.module.css'

export function GamesScreen() {
  const data = useTournament((s) => s.data)
  const [open, setOpen] = useState<string | null>(null)
  const tabs = useMemo(() => {
    if (!data) return []
    const m = data.settings.modules
    return (['individual', 'pairs', 'bestRound', 'snake', 'fewestPutts', 'auction'] as ModuleId[]).filter((id) => m[id].enabled).map((id) => ({ value: id, label: m[id].label }))
  }, [data])
  const [tab, setTab] = useState<ModuleId>('individual')
  if (!data) return null
  const { snapshot, state } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const current = tabs.some((x) => x.value === tab) ? tab : (tabs[0]?.value ?? 'individual')

  return (
    <div className="screen">
      <h1>{t.nav.games}</h1>
      <Segmented value={current} options={tabs} onChange={setTab} />

      {current === 'individual' && state.modules.individual && (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t.games.player}</th>
              {state.core.roundIds.map((rid, i) => (
                <th key={rid} className="num">
                  D{i + 1}
                </th>
              ))}
              <th className="num">{t.common.total}</th>
              <th className="num">$</th>
            </tr>
          </thead>
          <tbody>
            {state.modules.individual.rows.map((r) => (
              <tr key={r.playerId}>
                <td className="num">{r.label}</td>
                <td>
                  <button type="button" className={styles.linkBtn} onClick={() => setOpen(r.playerId)}>
                    {name(r.playerId)}
                  </button>
                  {r.countbackWhy && <HowCalculated why={r.countbackWhy} label={t.games.tiebreak} />}
                </td>
                {r.perRound.map((p, i) => (
                  <td key={i} className="num">
                    {p}
                  </td>
                ))}
                <td className="num">
                  <strong>{r.total}</strong>
                </td>
                <td className="num">{state.modules.individual!.prizes[r.playerId] ? formatMoney(state.modules.individual!.prizes[r.playerId]!.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {current === 'pairs' && state.modules.pairs && (
        <div className="stack">
          {state.modules.pairs.unpaired.length > 0 && <p className="help coral">{t.games.unpaired(state.modules.pairs.unpaired.map(name).join(', '))}</p>}
          <div className="list">
            {state.modules.pairs.rows.map((r) => (
              <div key={r.pairId} className="listItem listItem--static">
                <span className={`num ${styles.pos}`}>{r.label}</span>
                <span className={styles.pairAvatars}>
                  <Avatar name={name(r.playerIds[0])} url={byId.get(r.playerIds[0])?.avatarUrl} size="sm" />
                  <Avatar name={name(r.playerIds[1])} url={byId.get(r.playerIds[1])?.avatarUrl} size="sm" />
                </span>
                <span className="grow">
                  <strong>{r.name}</strong>
                  <span className="help" style={{ display: 'block' }}>
                    {name(r.playerIds[0])} & {name(r.playerIds[1])} · {r.perRound.join(' + ')}
                  </span>
                </span>
                <span className="num" style={{ fontSize: '1.3rem' }}>
                  {r.total}
                </span>
                {state.modules.pairs!.prizes[r.playerIds[0]] && <span className="chip chip--sun">{formatMoney(state.modules.pairs!.prizes[r.playerIds[0]]!.amount * 2)}</span>}
              </div>
            ))}
          </div>
          <h3>{t.games.headToHead}</h3>
          {state.core.roundIds.map((rid) => {
            const round = snapshot.rounds.find((r) => r.id === rid)!
            const groups = snapshot.groups.filter((g) => g.roundId === rid)
            return (
              <div key={rid} className="stack">
                <span className="label">{t.round.day(round.number)}</span>
                {groups.map((g) => {
                  const pairsIn = snapshot.pairs.filter((p) => [p.player1Id, p.player2Id].every((id) => g.playerIds.includes(id)))
                  return (
                    <div key={g.id} className="card card--cell row row--between" style={{ padding: 10 }}>
                      <span className="help">
                        {t.card.group} {g.number}
                      </span>
                      <span className="row" style={{ gap: 12 }}>
                        {pairsIn.map((p) => {
                          const pts = (state.core.rounds[rid]?.[p.player1Id]?.points ?? 0) + (state.core.rounds[rid]?.[p.player2Id]?.points ?? 0)
                          return (
                            <span key={p.id} className="small">
                              {p.name ?? `${name(p.player1Id)}&${name(p.player2Id)}`} <strong className="num">{pts}</strong>
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {current === 'bestRound' && state.modules.bestRound && (
        <div className="stack">
          {state.modules.bestRound.days.map((d) => (
            <div key={d.roundId} className="stack">
              <div className="row row--between">
                <h3>{t.round.day(d.roundNumber)}</h3>
                <span className="chip chip--sun">{formatMoney(data.settings.prizes.bestRoundPerDay)}</span>
              </div>
              <table className="table">
                <tbody>
                  {d.rows.slice(0, 12).map((r) => (
                    <tr key={r.playerId}>
                      <td className="num">{r.label}</td>
                      <td>
                        <button type="button" className={styles.linkBtn} onClick={() => setOpen(r.playerId)}>
                          {name(r.playerId)}
                        </button>
                      </td>
                      <td className="num">{t.round.thru(r.thru)}</td>
                      <td className="num">
                        <strong>{r.points}</strong>
                      </td>
                      <td className="num">{d.winners[r.playerId] ? formatMoney(d.winners[r.playerId]!.amount) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {current === 'snake' && state.modules.snake && <SnakeBoard onOpen={setOpen} />}

      {current === 'fewestPutts' && state.modules.fewestPutts && (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t.games.player}</th>
              <th className="num">{t.player.putts}</th>
              <th className="num">{t.player.puttsAvg}</th>
              <th className="num">1</th>
              <th className="num">3+</th>
              <th className="num">$</th>
            </tr>
          </thead>
          <tbody>
            {state.modules.fewestPutts.rows.map((r) => (
              <tr key={r.playerId} className={r.holes === 0 ? 'muted' : ''}>
                <td className="num">{r.holes ? r.label : '–'}</td>
                <td>
                  <button type="button" className={styles.linkBtn} onClick={() => setOpen(r.playerId)}>
                    {name(r.playerId)}
                  </button>
                  {r.pickedUpHoles > 0 && <span className="help"> · {r.pickedUpHoles} L</span>}
                </td>
                <td className="num">
                  <strong>{r.putts}</strong>
                  <span className="help"> /{r.holes}</span>
                </td>
                <td className="num">{r.holes ? r.average.toFixed(2) : ''}</td>
                <td className="num">{r.onePutts}</td>
                <td className="num">{r.threePutts}</td>
                <td className="num">{state.modules.fewestPutts!.prizes[r.playerId] ? formatMoney(state.modules.fewestPutts!.prizes[r.playerId]!.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {current === 'auction' && state.modules.auction && (
        <div className="stack">
          <div className="card card--deep row row--between">
            <span>
              <span className="label" style={{ color: 'var(--seafoam)' }}>
                {t.games.pot}
              </span>
              <strong style={{ display: 'block', fontSize: '1.8rem' }} className="num">
                {formatMoney(state.modules.auction.pot)}
              </strong>
            </span>
            <span className="help" style={{ color: 'var(--seafoam)' }}>
              {t.games.sold(state.modules.auction.soldCount, snapshot.players.length)}
            </span>
          </div>
          {state.modules.auction.slots.length > 0 && (
            <div className="list">
              {state.modules.auction.slots.map((s, i) => (
                <div key={i} className="listItem listItem--static">
                  <span className="grow">
                    <strong>{s.label}</strong>
                    <span className="help" style={{ display: 'block' }}>
                      {s.playerIds.map(name).join(', ')} · {Math.round(s.share * 100)}%
                    </span>
                  </span>
                  <HowCalculated why={s.why} label={formatMoney(s.amount)} />
                </div>
              ))}
            </div>
          )}
          <h3>{t.games.owners}</h3>
          <div className="list">
            {state.modules.auction.portfolios.map((pf) => (
              <div key={pf.ownerId} className="listItem listItem--static">
                <Avatar name={name(pf.ownerId)} url={byId.get(pf.ownerId)?.avatarUrl} />
                <span className="grow">
                  <strong>{name(pf.ownerId)}</strong>
                  <span className="help" style={{ display: 'block' }}>
                    {pf.holdings.map((h) => `${name(h.playerId)} ${h.pct < 100 ? `${h.pct}%` : ''}`).join(' · ')}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <strong className="num">{formatMoney(pf.value)}</strong>
                  <span className="help" style={{ display: 'block' }}>
                    {t.games.invested} {formatMoney(pf.invested)}
                    {pf.roi != null ? ` · ${pf.roi >= 0 ? '+' : ''}${Math.round(pf.roi * 100)}%` : ''}
                  </span>
                </span>
              </div>
            ))}
            {state.modules.auction.portfolios.length === 0 && <p className="help" style={{ padding: 14 }}>{t.games.noAuctionYet}</p>}
          </div>
        </div>
      )}

      <PlayerSheet playerId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

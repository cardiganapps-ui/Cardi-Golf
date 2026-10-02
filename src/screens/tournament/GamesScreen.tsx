/**
 * Juegos (§9.4): one line per game (who leads, what is at stake), then the
 * detail of each enabled module on the board primitives.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { Board, BoardHead, EmptyState, LeaderRow, Money, Segmented } from '../../components/primitives'
import { IconChevronLeft } from '../../components/icons'
import { useTournament } from '../../data/tournamentStore'
import type { ModuleId } from '../../engine/settings/schema'
import { formatMoney } from '../../lib/money'
import { BracketBoard } from './BracketBoard'
import { fieldShape, individualPrizeAmounts } from '../../engine/settings/prizeCheck'
import { figureKind } from '../../engine/formats'
import { PlayerSheet } from './PlayerSheet'
import { SnakeBoard } from './SnakeBoard'
import { GameBoardView, gameLeader, gameStake } from './GameBoardView'
import { useActiveRound } from './useMyGroup'
import { useTournamentCtx } from './TournamentGate'
import styles from './GamesScreen.module.css'

const ORDER: ModuleId[] = ['individual', 'pairs', 'bestRound', 'snake', 'fewestPutts', 'auction']

export function GamesScreen() {
  const data = useTournament((s) => s.data)
  const round = useActiveRound()
  const { slug } = useTournamentCtx()
  const cfg = data?.settings
  const hasMoney = !!cfg && (cfg.entryFee > 0 || cfg.modules.auction.enabled || cfg.games.some((g) => g.money.source !== 'none'))
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const tabs = useMemo(() => {
    if (!data) return []
    const m = data.settings.modules
    const mods: Array<{ value: string; label: string }> = ORDER.filter((id) => m[id].enabled).map((id) => ({ value: id, label: m[id].label }))
    const games = data.settings.games.filter((g) => g.enabled).map((g) => ({ value: `game:${g.id}`, label: g.label }))
    return [...mods, ...games]
  }, [data])
  if (!data) return null
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const money = (amount: number | undefined) => (amount ? <Money amount={amount} /> : null)
  const current = tab && tabs.some((x) => x.value === tab) ? tab : null
  // "Hoyo" is where a player is in the round being played (P1 17), never a cross-round count.
  const thruOf = (pid: string) => (round ? t.round.thru(state.core.rounds[round.id]?.[pid]?.thru ?? 0, round.holes) : undefined)
  const pairThru = (ids: readonly string[]) => (round ? t.round.thru(Math.min(...ids.map((pid) => state.core.rounds[round.id]?.[pid]?.thru ?? 0)), round.holes) : undefined)

  // One line per game: who leads, what is at stake.
  const overview = tabs.map(({ value: id, label }) => {
    let leader: string = t.games.noResults
    let stake: { text: string; amount?: number } = { text: '' }
    const m = state.modules
    if (id.startsWith('game:')) {
      const g = state.games[id.slice(5)]
      return { id, label, leader: g ? gameLeader(g, name) : t.games.outdated, stake: g ? gameStake(g) : stake }
    }
    if (id === 'individual' && m.individual) {
      const r = m.individual.rows[0]
      // The board's leader in the board's own figure: a team by its name, strokes against par, match points (STRAT-03).
      if (r && r.thru > 0) leader = t.games.leader(r.entrant.isTeam ? r.entrant.name : name(r.playerId), t.common.figure(r.figure.text, r.figure.value, figureKind(settings)))
      const first = individualPrizeAmounts(settings, fieldShape(snapshot, settings))[0] ?? 0
      stake = { text: t.games.firstPrize(formatMoney(first)), amount: first }
    } else if (id === 'pairs' && m.pairs) {
      const r = m.pairs.rows[0]
      if (r && r.thru > 0) leader = t.games.leader(r.name, t.games.pointsFigure(r.total))
      stake = { text: t.games.firstPrize(formatMoney(settings.prizes.pairs[0] ?? 0)), amount: settings.prizes.pairs[0] }
    } else if (id === 'bestRound' && m.bestRound) {
      const d = [...m.bestRound.days].reverse().find((x) => x.rows.some((r) => r.thru > 0)) ?? m.bestRound.days.at(-1)
      const r = d?.rows[0]
      if (d && r && r.thru > 0) leader = `${t.round.day(d.roundNumber)}: ${t.games.leader(name(r.playerId), t.games.pointsFigure(r.points))}`
      stake = { text: t.games.perDay(formatMoney(settings.prizes.bestRoundPerDay)), amount: settings.prizes.bestRoundPerDay }
    } else if (id === 'snake' && m.snake) {
      const groups = m.snake.groups.filter((g) => !round || g.roundId === round.id)
      const holders = groups.filter((g) => g.holderId).map((g) => name(g.holderId!))
      leader = holders.length ? `${t.games.holders}: ${t.common.andList(holders)}` : groups.length ? t.games.nobodyHolds : t.games.noResults
      const pot = groups[0]?.pot ?? 0
      stake = { text: t.games.perGroup(formatMoney(pot)), amount: pot }
    } else if (id === 'fewestPutts' && m.fewestPutts) {
      const r = m.fewestPutts.rows.find((x) => x.holes > 0)
      if (r) leader = t.games.leader(name(r.playerId), t.games.puttsFigure(r.putts))
      stake = { text: t.games.firstPrize(formatMoney(settings.prizes.fewestPutts)), amount: settings.prizes.fewestPutts }
    } else if (id === 'auction' && m.auction) {
      const s0 = m.auction.slots.find((x) => !x.unfilled)
      leader = s0 ? t.games.leader(t.common.andList(s0.playerIds.map(name)), formatMoney(s0.amount)) : m.auction.pot > 0 ? t.games.sold(m.auction.soldCount, snapshot.players.length) : t.games.noAuctionYet
      stake = { text: t.games.pot, amount: m.auction.pot }
    }
    return { id, label, leader, stake }
  })

  return (
    <div className={styles.screen}>
      {current === null ? (
        <>
          <h1>{t.nav.games}</h1>
          {overview.length === 0 ? (
            <EmptyState title={t.games.noResults} body={t.games.noResultsHint} />
          ) : (
            <div className={styles.overview}>
              {overview.map((g) => (
                <button key={g.id} type="button" className={styles.gameRow} onClick={() => setTab(g.id)}>
                  <span className={styles.gameText}>
                    <span className={styles.gameLabel}>{g.label}</span>
                    <span className={styles.gameLeader}>{g.leader}</span>
                  </span>
                  {g.stake.amount ? (
                    <span className={styles.gameStake}>
                      <strong>{formatMoney(g.stake.amount)}</strong>
                      <span>{g.stake.text.replace(formatMoney(g.stake.amount), '').replace(/^\s*(al|por)\s*/, '$1 ').trim() || t.games.pot}</span>
                    </span>
                  ) : g.stake.text ? (
                    <span className={styles.gameStake}>
                      <span>{g.stake.text}</span>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {/* "¿Qué es este juego?", "¿cuánto paga?" and "¿ya lo gané?" used to
              be three screens with no link between them. */}
          <nav className={styles.crossLinks} aria-label={t.games.more}>
            <Link className={styles.crossLink} to={`/t/${slug}/reglamento`}>
              {t.games.seeRules}
            </Link>
            {hasMoney && (
              <Link className={styles.crossLink} to={`/t/${slug}/dinero`}>
                {t.games.seeMoney}
              </Link>
            )}
          </nav>
        </>
      ) : (
        <>
          <div className={styles.detailHead}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab(null)} aria-label={t.common.back}>
              <IconChevronLeft />
            </button>
            <h1>{tabs.find((x) => x.value === current)?.label}</h1>
          </div>
          {tabs.length > 1 && <Segmented value={current} options={tabs} onChange={setTab} tabs label={t.nav.games} />}

          {/* Under match play the bracket is the story; the points table
              below it is the tiebreaker nobody reads first. */}
          {current === 'individual' && state.bracket && (
            <div className={styles.section}>
              <BracketBoard bracket={state.bracket} />
            </div>
          )}

          {current === 'individual' && state.modules.individual && (
            <div className={styles.section}>
              <Board>
                {/* The format's own column and figure, as En vivo shows them (STRAT-03): «Puntos» and «34» only where points count. */}
                <BoardHead figureLabel={state.modules.individual.figureLabel} dense={state.modules.individual.rows.length > 20} />
                {state.modules.individual.rows.map((r) => (
                  <LeaderRow
                    key={r.playerId}
                    pos={r.label}
                    name={r.entrant.isTeam ? r.entrant.name : name(r.playerId)}
                    sub={
                      <span className={styles.sub}>
                        {/* perRound became Figure[] with the format seam; it prints
                            as "[object Object]" if you interpolate it whole. */}
                        <span>{r.perRound.map((p, i) => `${t.round.day(i + 1)} ${p.text}`).join(', ')}</span>
                        {state.modules.individual!.prizes[r.playerId] && <span className={styles.subMoney}>{money(state.modules.individual!.prizes[r.playerId]!.amount)}</span>}
                      </span>
                    }
                    thru={r.entrant.isTeam ? undefined : thruOf(r.playerId)}
                    figure={r.figure.text}
                    tone={r.figure.tone === 'under' ? 'under' : r.figure.tone === 'over' ? 'over' : 'even'}
                    dense={state.modules.individual!.rows.length > 20}
                    onClick={() => setOpen(r.entrant.playerIds[0] ?? r.playerId)}
                  />
                ))}
              </Board>
              {state.modules.individual.rows.some((r) => r.countbackWhy) && (
                <div className={styles.rows}>
                  {state.modules.individual.rows
                    .filter((r) => r.countbackWhy)
                    .map((r) => (
                      <div key={r.playerId} className={styles.rowLine}>
                        <span className={styles.rowText}>
                          <span>
                            {r.label} {r.entrant.isTeam ? r.entrant.name : name(r.playerId)}
                          </span>
                        </span>
                        <HowCalculated why={r.countbackWhy!} label={t.games.tiebreak} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {current === 'pairs' && state.modules.pairs && (
            <div className={styles.section}>
              {state.modules.pairs.unpaired.length > 0 && <p className="help">{t.games.unpaired(t.common.andList(state.modules.pairs.unpaired.map(name)))}</p>}
              <Board>
                <BoardHead figureLabel={t.live.points} />
                {state.modules.pairs.rows.map((r) => (
                  <LeaderRow
                    key={r.pairId}
                    pos={r.label}
                    name={r.name}
                    sub={
                      <span className={styles.sub}>
                        <span>
                          {t.common.andList(r.playerIds.map(name))}, {t.common.plusList(r.perRound)}
                        </span>
                        {state.modules.pairs!.prizes[r.playerIds[0]] && <span className={styles.subMoney}>{money(state.modules.pairs!.prizes[r.playerIds[0]]!.amount * 2)}</span>}
                      </span>
                    }
                    thru={pairThru(r.playerIds)}
                    figure={String(r.total)}
                    onClick={() => setOpen(r.playerIds[0])}
                  />
                ))}
              </Board>
              <h3>{t.games.headToHead}</h3>
              {state.core.roundIds.map((rid) => {
                const rd = snapshot.rounds.find((r) => r.id === rid)!
                const groups = snapshot.groups.filter((g) => g.roundId === rid)
                return (
                  <div key={rid} className={styles.section}>
                    <span className="label">{t.round.day(rd.number)}</span>
                    <div className={styles.rows}>
                      {groups.map((g) => {
                        const pairsIn = snapshot.pairs.filter((p) => [p.player1Id, p.player2Id].every((id) => g.playerIds.includes(id)))
                        return (
                          <div key={g.id} className={styles.rowLine}>
                            <span className={styles.rowText}>
                              <span className={styles.rowSub}>
                                {t.card.group} {g.number}
                              </span>
                              <span>{pairsIn.map((p) => p.name ?? t.common.andList([name(p.player1Id), name(p.player2Id)])).join(t.common.versus)}</span>
                            </span>
                            {/* Before the draw a group holds no pair yet: no figures, and the text runs to the edge. */}
                            {pairsIn.length > 0 && (
                              <span className={styles.figures}>
                                {pairsIn.map((p) => (
                                  <strong key={p.id} className="num">
                                    {(state.core.rounds[rid]?.[p.player1Id]?.points ?? 0) + (state.core.rounds[rid]?.[p.player2Id]?.points ?? 0)}
                                  </strong>
                                ))}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {current === 'bestRound' && state.modules.bestRound && (
            <div className={styles.section}>
              {state.modules.bestRound.days.map((d) => (
                <div key={d.roundId} className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h3>{t.round.day(d.roundNumber)}</h3>
                    <span className="help">{t.games.perDay(formatMoney(settings.prizes.bestRoundPerDay))}</span>
                  </div>
                  <Board>
                    <BoardHead figureLabel={t.live.points} dense={d.rows.length > 20} />
                    {d.rows.map((r) => (
                      <LeaderRow
                        key={r.playerId}
                        pos={r.label}
                        name={name(r.playerId)}
                        sub={d.winners[r.playerId] ? <span className={styles.subMoney}>{money(d.winners[r.playerId]!.amount)}</span> : undefined}
                        thru={t.round.thru(r.thru, snapshot.rounds.find((x) => x.id === d.roundId)?.holes ?? 18)}
                        figure={String(r.points)}
                        dense={d.rows.length > 20}
                        onClick={() => setOpen(r.playerId)}
                      />
                    ))}
                  </Board>
                </div>
              ))}
            </div>
          )}

          {current === 'snake' && state.modules.snake && <SnakeBoard onOpen={setOpen} />}

          {current?.startsWith('game:') && <GameBoardView gameId={current.slice(5)} onOpen={setOpen} />}

          {current === 'fewestPutts' && state.modules.fewestPutts && (
            <Board>
              <BoardHead figureLabel={t.player.putts} dense={state.modules.fewestPutts.rows.length > 20} />
              {state.modules.fewestPutts.rows.map((r) => (
                <LeaderRow
                  key={r.playerId}
                  pos={r.holes ? r.label : '–'}
                  name={name(r.playerId)}
                  sub={
                    <span className={styles.sub}>
                      <span>
                        {r.holes ? `${r.average.toFixed(2)} por hoyo, ${r.onePutts} a uno, ${r.threePutts} a tres` : t.games.noResults}
                        {r.pickedUpHoles > 0 ? `, ${r.pickedUpHoles} L` : ''}
                      </span>
                      {state.modules.fewestPutts!.prizes[r.playerId] && <span className={styles.subMoney}>{money(state.modules.fewestPutts!.prizes[r.playerId]!.amount)}</span>}
                    </span>
                  }
                  thru={r.holes ? String(r.holes) : undefined}
                  figure={r.holes ? String(r.putts) : '–'}
                  dense={state.modules.fewestPutts!.rows.length > 20}
                  onClick={() => setOpen(r.playerId)}
                />
              ))}
            </Board>
          )}

          {current === 'auction' && state.modules.auction && (
            <div className={styles.section}>
              <div className={styles.potLine}>
                <span>
                  <span className="label">{t.games.pot}</span>
                  <br />
                  <span className={styles.pot}>{formatMoney(state.modules.auction.pot)}</span>
                </span>
                <span className="help">{t.games.sold(state.modules.auction.soldCount, snapshot.players.length)}</span>
              </div>
              {state.modules.auction.slots.length > 0 && (
                <div className={styles.rows}>
                  {state.modules.auction.slots.map((s, i) => (
                    <div key={i} className={styles.rowLine}>
                      <span className={styles.rowText}>
                        <strong>{s.label}</strong>
                        <span className={styles.rowSub}>
                          {s.unfilled ? t.games.unassigned : t.common.andList(s.playerIds.map(name))}, {Math.round(s.share * 100)}%
                        </span>
                      </span>
                      <HowCalculated why={s.why} label={formatMoney(s.amount)} />
                    </div>
                  ))}
                </div>
              )}
              <h3>{t.games.owners}</h3>
              {state.modules.auction.portfolios.length === 0 ? (
                <p className="help">{t.games.noAuctionYet}</p>
              ) : (
                <div className={styles.rows}>
                  {state.modules.auction.portfolios.map((pf) => (
                    <button key={pf.ownerId} type="button" className={styles.gameRow} onClick={() => setOpen(pf.ownerId)}>
                      <span className={styles.rowText}>
                        <strong>{name(pf.ownerId)}</strong>
                        <span className={styles.rowSub}>{t.common.andList(pf.holdings.map((h) => `${name(h.playerId)}${h.pct < 100 || pf.holdings.length > 1 ? ` ${h.pct}%` : ''}`))}</span>
                      </span>
                      <span className={styles.gameStake}>
                        <strong>{formatMoney(pf.value)}</strong>
                        <span>
                          {t.games.invested} {formatMoney(pf.invested)}
                          {pf.roi != null ? `, ${pf.roi >= 0 ? '+' : '−'}${Math.abs(Math.round(pf.roi * 100))}%` : ''}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <PlayerSheet playerId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

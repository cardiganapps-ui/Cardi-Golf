/**
 * Jugador (§9.5): one player's tournament: position, handicap with its
 * explanation, each round as a scorecard with notation (tap a hole for the
 * breakdown), pair and owners, money so far, and the basic stats.
 */
import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ExplanationSheet, HowCalculated } from '../../components/HowCalculated'
import { Avatar, Sheet } from '../../components/ui'
import { Money, ScorecardGrid, type GridHole } from '../../components/primitives'
import { ShareCardButton } from '../../components/ShareCard'
import { HandicapChanges } from '../../components/HandicapChanges'
import { correctionLine } from '../../lib/comiteReasons'
import { CardHistory } from './CardHistory'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentProfiles } from '../../data/profiles'
import { useTournamentCtx } from './tournamentContext'
import { useShowMoney } from './tournamentView'
import { formatMoney } from '../../lib/money'
import type { Explanation } from '../../engine/types'
import { figureKind, holeStrokes, mainScoring, strokesWhy, type Figure } from '../../engine/formats'
import type { PlayerRound } from '../../engine/core/types'
import { dayFigureText, ownDayText } from '../../lib/figureText'
import styles from './PlayerSheet.module.css'
import { useCurrency } from '../../components/currency'
import { buttonClass } from '../../components/buttonClass'

/**
 * Closed, it is nothing: it reads the boards only while a player is open, so a closed sheet renders nothing on a
 * change (PERF-09). Closing, it keeps the last player until the sheet has left the screen (MOT-09).
 */
export const PlayerSheet = memo(function PlayerSheet({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const [last, setLast] = useState(playerId)
  if (playerId && playerId !== last) setLast(playerId)
  const id = playerId ?? last
  return id ? <PlayerSheetOpen playerId={id} open={!!playerId} onClose={onClose} onExited={() => setLast(null)} /> : null
})

function PlayerSheetOpen({ playerId, open, onClose, onExited }: { playerId: string; open: boolean; onClose: () => void; onExited: () => void }) {
  const cur = useCurrency()
  const data = useTournament((s) => s.data)
  /** The in-memory fixtures have no server to ask a card's history of (TRUST-14). */
  const fixture = useTournament((s) => s.tournamentId?.startsWith('fixture:') ?? false)
  const [why, setWhy] = useState<{ title: string; why: Explanation } | null>(null)
  const { tournamentId, spectator } = useTournamentCtx()
  // A link to watch (STRAT-05) asks nobody's profile, and «Sin dinero» shows no money section.
  const [profiles] = useTournamentProfiles(spectator ? null : tournamentId)
  const showMoney = useShowMoney()
  const p = data?.snapshot.players.find((x) => x.id === playerId)
  const money = useMemo(() => (playerId && data ? data.state.prizes.filter((x) => x.playerId === playerId) : []), [data, playerId])
  const rounds = useMemo(
    () => (data && p ? data.state.core.roundIds.map((rid) => ({ round: data.snapshot.rounds.find((r) => r.id === rid)!, pr: data.state.core.rounds[rid]?.[p.id] })) : []),
    [data, p],
  )
  // The engine's own counts, so the sheet and Estadísticas agree: on the score the event counts (net points, or the
  // net or gross score).
  const stats = useMemo(() => {
    const s = playerId ? data?.state.stats.players[playerId] : undefined
    return { birdies: s?.grossBirdies ?? 0, netBirdies: s?.netBirdies ?? 0, pars: s?.pars ?? 0, bogeys: s?.bogeys ?? 0, worse: s?.doubleOrWorse ?? 0, pickups: s?.pickUps ?? 0 }
  }, [data, playerId])
  if (!data || !p) return null
  const { snapshot, state, settings } = data
  // The pairs game's pair, under its label; a team format's pairs are teams, named in the header.
  const pair = settings.modules.pairs.enabled ? snapshot.pairs.find((x) => x.player1Id === p.id || x.player2Id === p.id) : undefined
  const partner = pair ? snapshot.players.find((x) => x.id === (pair.player1Id === p.id ? pair.player2Id : pair.player1Id)) : null
  const auction = state.modules.auction
  const myLot = auction?.lots.find((l) => l.playerId === p.id && l.status === 'sold')
  const owned = auction?.lots.filter((l) => l.status === 'sold' && l.owners.some((o) => o.ownerId === p.id)) ?? []
  const person = state.money.people[p.id]
  const nameOf = (id: string) => snapshot.players.find((x) => x.id === id)?.displayName ?? '?'
  // The board's row for this player: his own, or his team's in a team format.
  const row = state.modules.individual?.rows.find((r) => r.entrant.playerIds.includes(p.id))
  const kind = figureKind(settings)
  const scoring = mainScoring(settings)
  /** Points rows and points explanations only where something counts points (STRAT-03). */
  const showPoints = scoring === 'points' || settings.modules.bestRound.enabled || settings.modules.pairs.enabled
  /** In a team format the row is the team's; this sheet is his own card. */
  const team = row?.entrant.isTeam ? row.entrant : null
  /**
   * A day's figure as the board writes it, with its unit; a match's day is its
   * result with its side («ganó 3&2», a fourball side's too); a team player's
   * day in a strokes or points team event is his own card.
   */
  const dayFigure = (f: Figure | undefined, pr: PlayerRound) => {
    if (team && kind !== 'match') return ownDayText(pr, scoring) ?? '—'
    if (scoring === 'points') return t.common.figure(String(pr.points), pr.points, 'points')
    return !f || f.empty ? '—' : kind === 'match' ? dayFigureText(f) : t.common.figure(f.text, f.value, kind)
  }
  const hc = state.core.handicaps[p.id]
  const totals = state.core.totals[p.id]
  const putts = state.modules.fewestPutts?.rows.find((r) => r.playerId === p.id)
  const profile = profiles.find((x) => x.playerId === p.id && x.status === 'confirmed')
  // Changed after they were fixed (UX-28): what it was, what it is, and the Comité's reasons.
  const hcpChange = state.flags.handicapChanges.find((c) => c.playerId === p.id)

  return (
    <Sheet open={open} onClose={onClose} onExited={onExited} title={p.fullName} wide>
      <div className={styles.sheet}>
        <div className={styles.head}>
          <Avatar name={p.displayName} url={p.avatarUrl} size="lg" honoree={p.isHonoree} />
          <div className={styles.headText}>
            <span className={styles.headLine}>
              {p.tier && <span className="tierBadge">{p.tier}</span>}
              {row && totals ? (
                <span>
                  {(team ? (f: string, w: string | null) => t.player.positionTeam(row.label, team.name, f, w) : (f: string, w: string | null) => t.player.position(row.label, f, w))(
                    t.common.figure(row.figure.text, row.figure.value, kind),
                    whereNow(rounds),
                  )}
                </span>
              ) : null}
            </span>
          </div>
          {profile && (
            <Link className={buttonClass({ variant: 'ghost', size: 'sm' })} to={`/p/${profile.handle}`}>
              {t.profile.viewProfile}
            </Link>
          )}
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className="label">{t.admin.players.handicap}</span>
            {hc && <HowCalculated why={[hc.why, ...rounds.filter((r) => r.pr).map((r) => r.pr!.playingHcpWhy)]} />}
          </div>
          <p className={styles.line}>
            <strong>{t.player.handicapLine(hc?.base ?? p.baseHcp, hc?.source === 'manual' ? t.admin.players.baseHcp : t.admin.players.index)}</strong>
            {hc?.estimated ? ` (${t.admin.players.estimated})` : ''}
            {rounds.filter((r) => r.pr).map(({ round, pr }) => `, ${t.player.dayHcp(round.number, pr!.playingHcp, pr!.cut)}${pr!.overridden ? ` (${t.admin.handicaps.override.toLowerCase()})` : ''}`)}
          </p>
          {hcpChange && <HandicapChanges change={hcpChange} timeZone={settings.timezone} />}
        </section>

        {rounds.map(({ round, pr }, idx) =>
          pr ? (
            <section key={round.id} className={styles.section}>
              <div className={styles.sectionHead}>
                <h3>{t.player.round(round.number, dayFigure(row?.perRound[idx], pr))}</h3>
                <span className="help">{t.player.grossPutts(pr.gross, pr.putts)}</span>
              </div>
              <ScorecardGrid
                holes={pr.holes.map<GridHole>((h) => ({
                  n: h.hole,
                  par: h.par,
                  si: h.strokeIndex,
                  gross: h.played ? h.gross : null,
                  pickedUp: h.played && h.pickedUp,
                  // Where the event counts strokes, a pick-up counts as net double bogey in the total too (STRAT-03).
                  counted: scoring !== 'points' && h.played ? holeStrokes(h, false) : undefined,
                  pts: h.played ? h.points : undefined,
                  putts: h.played ? h.putts : null,
                }))}
                playerLabel={p.displayName}
                showPoints={showPoints}
                showPutts
                onHole={(n) => {
                  const h = pr.holes[n - 1]
                  if (h) setWhy({ title: t.player.whyHole(n), why: scoring === 'points' ? h.why : strokesWhy(h, scoring === 'net') })
                }}
              />
              {/* TRUST-14: what the Comité corrected on his card, and why, where everyone reads his card. */}
              {pr.holes.some((h) => h.correction) && (
                <ul className={styles.corrections} aria-label={t.card.correctionsTitle}>
                  {pr.holes
                    .filter((h) => h.correction)
                    .map((h) => (
                      <li key={h.hole}>{correctionLine(h.hole, null, h.correction!)}</li>
                    ))}
                </ul>
              )}
            </section>
          ) : null,
        )}

        {/* TRUST-14: how each hole got to what it holds, for everyone in the tournament; never from a link to watch. */}
        {!spectator && !fixture && rounds.some((r) => r.pr) && <CardHistory key={p.id} tournamentId={tournamentId} playerId={p.id} timeZone={settings.timezone} />}

        {(pair || myLot || owned.length > 0) && (
          <section className={styles.section}>
            {pair && partner && (
              <p className={styles.line}>
                <span className="label">{settings.modules.pairs.label}</span>
                <br />
                {pair.name ? `${pair.name}, ` : ''}
                {t.player.partner.toLowerCase()}: <strong>{partner.displayName}</strong>
              </p>
            )}
            {myLot && showMoney && (
              <p className={styles.line}>
                <span className="label">{settings.modules.auction.label}</span>
                <br />
                {t.player.ownedBy}: {t.common.andList(myLot.owners.map((o) => `${nameOf(o.ownerId)} ${o.pct}%`))}, {formatMoney(myLot.price, cur)}
              </p>
            )}
            {owned.length > 0 && showMoney && (
              <p className={styles.line}>
                {t.player.owns}: {t.common.andList(owned.map((l) => `${nameOf(l.playerId)} ${l.owners.find((o) => o.ownerId === p.id)!.pct}%`))}
              </p>
            )}
          </section>
        )}

        {showMoney && (
          <section className={styles.section}>
            <span className="label">{t.nav.money}</span>
            {money.length === 0 && <span className="help">{t.player.noMoneyYet}</span>}
            {(money.length > 0 || person) && (
              <div className={styles.rows}>
                {money.map((m, i) => (
                  <div key={i} className={styles.row}>
                    <span>
                      {m.label}
                      {!m.final && <span className="help">{t.money.ifEndedNow}</span>}
                    </span>
                    <HowCalculated why={m.why} label={formatMoney(m.amount, cur)} about={m.label} />
                  </div>
                ))}
                {person && (
                  <div className={`${styles.row} ${styles.rowTotal}`}>
                    <span>
                      {t.money.puts} {formatMoney(person.paid, cur)}, {t.money.receives.toLowerCase()} {formatMoney(person.receives, cur)}
                    </span>
                    <span className={`${styles.net} ${person.net < 0 ? styles.netNeg : ''}`}>
                      <Money amount={person.net} signed />
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className="label">{t.player.stats}</span>
            <ShareCardButton what={{ kind: 'player', playerId: p.id }} className={buttonClass({ variant: 'ghost', size: 'sm' })} />
          </div>
          <div className={styles.stats}>
            <Stat label={t.player.birdies} v={stats.birdies} />
            <Stat label={t.player.netBirdies} v={stats.netBirdies} />
            <Stat label={scoring === 'gross' ? t.stats.pars : t.player.pars} v={stats.pars} />
            <Stat label={scoring === 'gross' ? t.stats.bogeys : t.player.bogeys} v={stats.bogeys} />
            <Stat label={t.player.worse} v={stats.worse} />
            <Stat label={t.player.pickups} v={stats.pickups} />
            {putts && <Stat label={t.player.puttsAvg} v={putts.average} />}
            {putts && <Stat label={t.player.onePutts} v={putts.onePutts} />}
            {putts && <Stat label={t.player.threePutts} v={putts.threePutts} />}
            {state.modules.snake && <Stat label={t.player.snakeHoles(settings.modules.snake.label)} v={state.modules.snake.holesHeld[p.id] ?? 0} />}
          </div>
        </section>
      </div>
      <ExplanationSheet why={why?.why ?? null} open={!!why} onClose={() => setWhy(null)} title={why?.title} />
    </Sheet>
  )
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{v}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

/** How far the player is, on the latest day he has played a hole of (COPY-26); null before his first hole. */
function whereNow(rounds: ReadonlyArray<{ round: { holes: number; number: number }; pr: PlayerRound | undefined }>): string | null {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const { round, pr } = rounds[i]!
    if (pr && pr.thru > 0) return t.player.where(pr.thru, round.holes, round.number, rounds.length, i === rounds.length - 1)
  }
  return null
}

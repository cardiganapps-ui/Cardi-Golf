/**
 * Jugador (§9.5): one player's tournament: position, handicap with its
 * explanation, each round as a scorecard with notation (tap a hole for the
 * breakdown), pair and owners, money so far, and the basic stats.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ExplanationSheet, HowCalculated } from '../../components/HowCalculated'
import { Avatar, Sheet } from '../../components/ui'
import { Money, ScorecardGrid, type GridHole } from '../../components/primitives'
import { ShareCardButton } from '../../components/ShareCard'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentProfiles } from '../../data/profiles'
import { useTournamentCtx } from './TournamentGate'
import { formatMoney } from '../../lib/money'
import type { Explanation } from '../../engine/types'
import { figureKind, mainScoring, strokesWhy, type Figure } from '../../engine/formats'
import type { PlayerRound } from '../../engine/core/types'
import { dayFigureText, ownDayText } from '../../lib/figureText'
import styles from './PlayerSheet.module.css'

export function PlayerSheet({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const data = useTournament((s) => s.data)
  const [why, setWhy] = useState<{ title: string; why: Explanation } | null>(null)
  const { tournamentId } = useTournamentCtx()
  const [profiles] = useTournamentProfiles(playerId ? tournamentId : null)
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
   * result with its side («ganó 3&2»); a team player's day is his own card.
   */
  const dayFigure = (f: Figure | undefined, pr: PlayerRound) => {
    if (team) return ownDayText(pr, scoring) ?? '—'
    if (scoring === 'points') return t.common.figure(String(pr.points), pr.points, 'points')
    return !f || f.empty ? '—' : kind === 'match' ? dayFigureText(f) : t.common.figure(f.text, f.value, kind)
  }
  const hc = state.core.handicaps[p.id]
  const totals = state.core.totals[p.id]
  const putts = state.modules.fewestPutts?.rows.find((r) => r.playerId === p.id)
  const profile = profiles.find((x) => x.playerId === p.id && x.status === 'confirmed')

  return (
    <Sheet open={!!playerId} onClose={onClose} title={p.fullName} wide>
      <div className={styles.sheet}>
        <div className={styles.head}>
          <Avatar name={p.displayName} url={p.avatarUrl} size="lg" honoree={p.isHonoree} />
          <div className={styles.headText}>
            <span className={styles.headLine}>
              {p.tier && <span className="tierBadge">{p.tier}</span>}
              {row && totals ? (
                <span>
                  {(team ? (f: string, thru: string) => t.player.positionTeam(row.label, team.name, f, thru) : (f: string, thru: string) => t.player.position(row.label, f, thru))(
                    t.common.figure(row.figure.text, row.figure.value, kind),
                    t.round.thru(totals.thru, rounds.reduce((a, r) => a + r.round.holes, 0) || 18),
                  )}
                </span>
              ) : null}
            </span>
          </div>
          {profile && (
            <Link className="btn btn--ghost btn--sm" to={`/p/${profile.handle}`}>
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
        </section>

        {rounds.map(({ round, pr }, idx) =>
          pr ? (
            <section key={round.id} className={styles.section}>
              <div className={styles.sectionHead}>
                <h3>{t.player.round(round.number, dayFigure(row?.perRound[idx], pr))}</h3>
                <span className="help">{t.player.grossPutts(pr.gross, pr.putts)}</span>
              </div>
              <ScorecardGrid
                holes={pr.holes.map<GridHole>((h) => ({ n: h.hole, par: h.par, si: h.strokeIndex, gross: h.played ? h.gross : null, pickedUp: h.played && h.pickedUp, pts: h.played ? h.points : undefined, putts: h.played ? h.putts : null }))}
                playerLabel={p.displayName}
                showPoints={showPoints}
                showPutts
                onHole={(n) => {
                  const h = pr.holes[n - 1]
                  if (h) setWhy({ title: t.player.whyHole(n), why: scoring === 'points' ? h.why : strokesWhy(h, scoring === 'net') })
                }}
              />
            </section>
          ) : null,
        )}

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
            {myLot && (
              <p className={styles.line}>
                <span className="label">{settings.modules.auction.label}</span>
                <br />
                {t.player.ownedBy}: {t.common.andList(myLot.owners.map((o) => `${nameOf(o.ownerId)} ${o.pct}%`))}, {formatMoney(myLot.price)}
              </p>
            )}
            {owned.length > 0 && (
              <p className={styles.line}>
                {t.player.owns}: {t.common.andList(owned.map((l) => `${nameOf(l.playerId)} ${l.owners.find((o) => o.ownerId === p.id)!.pct}%`))}
              </p>
            )}
          </section>
        )}

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
                  <HowCalculated why={m.why} label={formatMoney(m.amount)} />
                </div>
              ))}
              {person && (
                <div className={`${styles.row} ${styles.rowTotal}`}>
                  <span>
                    {t.money.paid} {formatMoney(person.paid)}, {t.money.receives.toLowerCase()} {formatMoney(person.receives)}
                  </span>
                  <span className={`${styles.net} ${person.net < 0 ? styles.netNeg : ''}`}>
                    <Money amount={person.net} signed />
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className="label">{t.player.stats}</span>
            <ShareCardButton what={{ kind: 'player', playerId: p.id }} className="btn btn--ghost btn--sm" />
          </div>
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

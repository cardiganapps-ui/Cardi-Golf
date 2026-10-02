/**
 * Branded share cards (§9.11): a hidden, fixed-width card rendered off-screen,
 * turned into a PNG on tap. Three kinds: leaderboard, a player's round, the
 * settlement. Sized for WhatsApp (1080 px wide at 2×).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ordinal, t } from '../i18n/es-MX'
import { useTournament } from '../data/tournamentStore'
import { formatMoney, formatSignedMoney } from '../lib/money'
import { shareCard } from './shareAction'
import { figureKind, holeStrokes, mainScoring } from '../engine/formats'
import { Wordmark } from './primitives'
import styles from './ShareCard.module.css'

export type ShareKind = { kind: 'leaderboard' } | { kind: 'player'; playerId: string } | { kind: 'settlement' }

export function ShareCardButton({ what, label, className }: { what: ShareKind; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const data = useTournament((s) => s.data)
  const slug = data?.snapshot.tournament.slug
  const name = data?.snapshot.tournament.name ?? ''
  // The card is mounted off-screen only while an image is being generated.
  useEffect(() => {
    if (!busy || !ref.current) return
    let cancelled = false
    const node = ref.current
    const run = async () => {
      await new Promise((r) => setTimeout(r, 50))
      if (cancelled) return
      try {
        await shareCard(node, `${slug}-${what.kind}.png`, name)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [busy, slug, name, what.kind])
  if (!data) return null
  const text = label || (what.kind === 'leaderboard' ? t.share.leaderboard : what.kind === 'player' ? t.share.round : t.share.settlement)
  return (
    <>
      <button className={className ?? 'btn btn--secondary btn--sm'} type="button" disabled={busy} onClick={() => setBusy(true)}>
        {busy ? t.share.generating : text}
      </button>
      {busy && (
        <div className={styles.offscreen} aria-hidden="true">
          <div ref={ref} className={styles.card} data-share-card={what.kind}>
            <Card what={what} />
          </div>
        </div>
      )}
    </>
  )
}

function Card({ what }: { what: ShareKind }) {
  const data = useTournament((s) => s.data)!
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.displayName ?? '?') : t.moneyScreen.bank)
  const header = (sub: string) => (
    <div className={styles.header}>
      {snapshot.tournament.logoUrl && <img src={snapshot.tournament.logoUrl} alt="" className={styles.logo} crossOrigin="anonymous" />}
      <div>
        <div className={styles.title}>{snapshot.tournament.name}</div>
        <div className={styles.sub}>{sub}</div>
      </div>
    </div>
  )
  const footer = (
    <div className={styles.footer}>
      <span>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      <Wordmark size={13} />
    </div>
  )
  if (what.kind === 'leaderboard') {
    const rows = state.modules.individual?.rows ?? []
    return (
      <>
        {header(`${settings.modules.individual.label}: ${state.tournamentFinal ? t.common.final : t.money.ifEndedNow}`)}
        <Rows>
          {rows.map((r) => {
            // A team's row is the team: its name, and what its members win together.
            const cash = state.prizes.filter((p) => r.entrant.playerIds.includes(p.playerId)).reduce((a, p) => a + p.amount, 0)
            return (
              <div key={r.playerId} className={styles.row}>
                <span className={styles.pos}>{r.label}</span>
                <span className={styles.name}>{r.entrant.isTeam ? r.entrant.name : nameOf(r.playerId)}</span>
                <span className={styles.small}>{t.common.plusList(r.perRound.map((f) => f.text))}</span>
                <span className={styles.big}>{r.figure.text}</span>
                <span className={styles.cash}>{cash > 0 ? formatMoney(cash) : ''}</span>
              </div>
            )
          })}
        </Rows>
        {footer}
      </>
    )
  }
  if (what.kind === 'player') {
    const p = byId.get(what.playerId)
    if (!p) return null
    // His own row, or his team's; the figure in the event's own unit (STRAT-03).
    const row = state.modules.individual?.rows.find((r) => r.entrant.playerIds.includes(p.id))
    const kind = figureKind(settings)
    const scoring = mainScoring(settings)
    return (
      <>
        {header(`${p.fullName}${row ? `, ${ordinal(row.label)}, ${t.common.figure(row.figure.text, row.figure.value, kind)}` : ''}`)}
        {state.core.roundIds.map((rid, i) => {
          const pr = state.core.rounds[rid]?.[p.id]
          if (!pr || pr.thru === 0) return null
          const day = row?.perRound[i]
          const dayFigure =
            scoring === 'points' ? t.common.figure(String(pr.points), pr.points, 'points') : !day || day.empty ? null : kind === 'match' ? day.text : t.common.figure(day.text, day.value, kind)
          return (
            <div key={rid} className={styles.round}>
              <div className={styles.roundTitle}>
                {[t.round.day(i + 1), `${t.live.playingHcp.toLowerCase()} ${pr.playingHcp}`, dayFigure, `${pr.putts} putts`].filter(Boolean).join(', ')}
              </div>
              <div className={styles.holes}>
                {pr.holes.map((h) => {
                  // Under strokes a hole is marked on the score the event counts, and shows no points.
                  const toPar = scoring === 'points' || !h.played ? null : (holeStrokes(h, scoring === 'net') ?? h.par) - h.par
                  const good = scoring === 'points' ? h.points >= 3 : toPar != null && toPar <= -1
                  const bad = scoring === 'points' ? h.points === 0 && h.played : toPar != null && toPar >= 2
                  return (
                    <div key={h.hole} className={`${styles.hole} ${good ? styles.birdie : bad ? styles.zero : ''}`}>
                      <span className={styles.holeNum}>{h.hole}</span>
                      <span className={styles.holeGross}>{h.pickedUp ? 'L' : (h.gross ?? '')}</span>
                      <span className={styles.holePts}>{h.played && scoring === 'points' ? h.points : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {footer}
      </>
    )
  }
  const people = snapshot.players.map((pl) => state.money.people[pl.id]!).filter(Boolean).sort((a, b) => b.net - a.net)
  return (
    <>
      {header(`${t.moneyScreen.final}: ${state.tournamentFinal ? t.common.final : t.money.ifEndedNow}`)}
      <Rows>
        {people.map((m) => (
          <div key={m.playerId} className={styles.row}>
            <span className={styles.name}>{nameOf(m.playerId)}</span>
            <span className={styles.small}>
              {t.money.paid} {formatMoney(m.paid)}, {t.money.receives.toLowerCase()} {formatMoney(m.receives)}
            </span>
            <span className={`${styles.big} ${m.net >= 0 ? styles.pos : styles.neg}`}>{formatSignedMoney(m.net)}</span>
          </div>
        ))}
      </Rows>
      {footer}
    </>
  )
}

function Rows({ children }: { children: ReactNode }) {
  return <div className={styles.rows}>{children}</div>
}

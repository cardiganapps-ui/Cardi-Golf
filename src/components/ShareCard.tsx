/**
 * Branded share cards (§9.11): a hidden, fixed-width card rendered off-screen,
 * turned into a PNG on tap. Three kinds: leaderboard, a player's round, the
 * settlement. Sized for WhatsApp (1080 px wide at 2×).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { useTournament } from '../data/tournamentStore'
import { formatMoney, formatSignedMoney } from '../lib/money'
import { shareNodeAsImage } from '../lib/shareImage'
import { Wave } from './Wave'
import { toast } from './ui'
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
        await shareNodeAsImage(node, `${slug}-${what.kind}.png`, name)
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) toast(t.share.failed)
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
          <div ref={ref} className={styles.card}>
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
      <Wave className={styles.wave} />
      <span>Cardi-Golf</span>
    </div>
  )
  if (what.kind === 'leaderboard') {
    const rows = state.modules.individual?.rows ?? []
    return (
      <>
        {header(`${settings.modules.individual.label} · ${state.tournamentFinal ? 'Final' : t.money.ifEndedNow}`)}
        <Rows>
          {rows.map((r) => {
            const cash = state.prizes.filter((p) => p.playerId === r.playerId).reduce((a, p) => a + p.amount, 0)
            return (
              <div key={r.playerId} className={styles.row}>
                <span className={styles.pos}>{r.label}</span>
                <span className={styles.name}>{nameOf(r.playerId)}</span>
                <span className={styles.small}>{r.perRound.join(' + ')}</span>
                <span className={styles.big}>{r.total}</span>
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
    const row = state.modules.individual?.rows.find((r) => r.playerId === p.id)
    return (
      <>
        {header(`${p.fullName}${row ? ` · ${row.label}º · ${row.total} pts` : ''}`)}
        {state.core.roundIds.map((rid, i) => {
          const pr = state.core.rounds[rid]?.[p.id]
          if (!pr || pr.thru === 0) return null
          return (
            <div key={rid} className={styles.round}>
              <div className={styles.roundTitle}>
                {t.round.day(i + 1)} · {t.live.playingHcp} {pr.playingHcp} · {pr.points} pts · {pr.putts} putts
              </div>
              <div className={styles.holes}>
                {pr.holes.map((h) => (
                  <div key={h.hole} className={`${styles.hole} ${h.points >= 3 ? styles.birdie : h.points === 0 && h.played ? styles.zero : ''}`}>
                    <span className={styles.holeNum}>{h.hole}</span>
                    <span className={styles.holeGross}>{h.pickedUp ? 'L' : (h.gross ?? '')}</span>
                    <span className={styles.holePts}>{h.played ? h.points : ''}</span>
                  </div>
                ))}
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
      {header(`${t.moneyScreen.final} · ${state.tournamentFinal ? 'Final' : t.money.ifEndedNow}`)}
      <Rows>
        {people.map((m) => (
          <div key={m.playerId} className={styles.row}>
            <span className={styles.name}>{nameOf(m.playerId)}</span>
            <span className={styles.small}>
              {t.money.paid} {formatMoney(m.paid)} · {t.money.receives} {formatMoney(m.receives)}
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

/**
 * Branded share cards (§9.11): a hidden, fixed-width card rendered off-screen,
 * turned into a PNG on tap. Three kinds: leaderboard, a player's round, the
 * settlement. Sized for WhatsApp (1080 px wide at 2×).
 *
 * PWA-06 (2026-10-16). The image travels where «¿Cómo se calculó?» can't, so:
 * - Money is on the settlement card only. The leaderboard's column summed every
 *   peso a person collects, Calcutta returns included, beside his Stableford
 *   place, so 7th place «won» $6,600 under «si terminara ahora».
 * - No card runs taller than 1.8 times its width (WhatsApp shrinks a tall image
 *   to a strip): the leaderboard shows the first ten and the sharer's own row,
 *   the settlement its first lines, and each says how many more the app holds.
 * - The settlement says who pays whom, vía banco or sin banco as Dinero shows
 *   it, and a winner's net is in ink, never the grey a place number wears.
 * - Every card carries the event's accent on the rule under its name, and a
 *   footer with the wordmark and a link: the link to watch when shared from one
 *   (the example tournament's own address on `/demo`), else Polo's own address.
 *   Never a tournament's link from a member's phone, so a «Con dinero» TV link
 *   is never passed around by accident (§7).
 */
import { memo, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ordinal, t } from '../i18n/es-MX'
import { useTournament } from '../data/tournamentStore'
import { TournamentContext } from '../screens/tournament/tournamentContext'
import { formatMoney, formatSignedMoney } from '../lib/money'
import { nearestAccent } from '../design/accents'
import { shareCard } from './shareAction'
import { figureKind, mainScoring, type Figure } from '../engine/formats'
import { dayFigureText, holeMark, ownDayText } from '../lib/figureText'
import { Wordmark } from './primitives'
import { TournamentLogo } from './TournamentLogo'
import styles from './ShareCard.module.css'
import { useCurrency, useWords } from './currency'
import { localDay } from '../lib/localWhen'

/** `settle`: the settlement as Dinero shows it, vía banco (the default) or sin banco. */
export type ShareKind = { kind: 'leaderboard' } | { kind: 'player'; playerId: string } | { kind: 'settlement'; settle?: 'bank' | 'p2p' }

/** The leaderboard's rows on its card, plus the sharer's own when he is further down (PWA-06). */
export const CARD_ROWS = 10
/** The settlement's payment lines, and the people whose net it lists in two columns. */
export const CARD_TRANSFERS = 12
export const CARD_NETS = 16

/** What the card's footer links to and what the share carries: the link to watch, the example, or Polo's own address. */
function cardLink(spectator: { url: string; demo?: boolean } | undefined): { url: string; text: string } {
  if (spectator) return { url: spectator.url, text: (spectator.demo ? t.share.demoLink : t.spectator.cardLink)(spectator.url.replace(/^https?:\/\//, '')) }
  const origin = typeof location !== 'undefined' ? location.origin : ''
  return { url: origin, text: origin.replace(/^https?:\/\//, '') }
}

/** Memoized: a screen re-rendering around it renders no share button (PERF-09). */
export const ShareCardButton = memo(function ShareCardButton({ what, label, className }: { what: ShareKind; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  // Two words, not the boards: a score saved elsewhere renders no share button (PERF-09). The card reads the boards.
  const slug = useTournament((s) => s.data?.snapshot.tournament.slug)
  const name = useTournament((s) => s.data?.snapshot.tournament.name ?? '')
  const accent = useTournament((s) => s.data?.snapshot.tournament.accentColor ?? null)
  const spectator = useContext(TournamentContext)?.spectator
  // The card is mounted off-screen only while an image is being generated.
  useEffect(() => {
    if (!busy || !ref.current) return
    let cancelled = false
    const node = ref.current
    const run = async () => {
      await new Promise((r) => setTimeout(r, 50))
      if (cancelled) return
      try {
        // A link to watch has no slug to name the file after (STRAT-05). The message carries the card's link, tappable.
        await shareCard(node, `${slug || 'polo'}-${what.kind}.png`, name, cardLink(spectator).url || undefined)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [busy, slug, name, what.kind, spectator])
  if (slug == null) return null
  const text = label || (what.kind === 'leaderboard' ? t.share.leaderboard : what.kind === 'player' ? t.share.round : t.share.settlement)
  return (
    <>
      <button className={className ?? 'btn btn--secondary btn--sm'} type="button" disabled={busy} onClick={() => setBusy(true)}>
        {busy ? t.share.generating : text}
      </button>
      {busy && (
        <div className={styles.offscreen} aria-hidden="true">
          {/* Light in either theme: the image goes to WhatsApp, read on any phone (VIS-11). */}
          <div ref={ref} className={styles.card} data-share-card={what.kind} data-theme="light" data-accent={nearestAccent(accent).id}>
            <Card what={what} />
          </div>
        </div>
      )}
    </>
  )
})

function Card({ what }: { what: ShareKind }) {
  const cur = useCurrency()
  const words = useWords()
  const data = useTournament((s) => s.data)!
  const ctx = useContext(TournamentContext)
  const link = cardLink(ctx?.spectator)
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.displayName ?? '?') : t.moneyScreen.bank)
  const header = (sub: string) => (
    <div className={styles.header}>
      {snapshot.tournament.logoUrl && <TournamentLogo url={snapshot.tournament.logoUrl} className={styles.logo} crossOrigin="anonymous" />}
      <div>
        <div className={styles.title}>{snapshot.tournament.name}</div>
        <div className={styles.sub}>{sub}</div>
      </div>
    </div>
  )
  const footer = (
    <div className={styles.footer}>
      <span>{localDay(new Date(), settings.timezone)}</span>
      {link.text && <span className={styles.watch} data-card-link>{link.text}</span>}
      <Wordmark size={13} />
    </div>
  )
  /** «Y 50 más: el resto está en Polo»: what a card left out, said, never silently cut. */
  const more = (n: number) => n > 0 && <div className={styles.more}>{t.share.more(n)}</div>
  if (what.kind === 'leaderboard') {
    const rows = state.modules.individual?.rows ?? []
    // Days add up only in points («36 + 38»); strokes and matches list the days they played («−11, +5», «ganó 6&5»).
    const points = figureKind(settings) === 'points'
    const daysText = (days: Figure[]) => {
      const played = days.filter((f) => !f.empty).map(dayFigureText)
      return points ? t.common.plusList(played) : played.join(', ')
    }
    // The first ten, and the sharer's own row when it is further down: a 60-player board was a 1080×6134 strip (PWA-06).
    const me = ctx?.me.playerId ?? null
    const top = rows.slice(0, CARD_ROWS)
    const mine = me ? rows.find((r) => r.entrant.playerIds.includes(me)) : undefined
    const shown = mine && !top.includes(mine) ? [...top, mine] : top
    const row = (r: (typeof rows)[number]) => (
      <div key={r.playerId} className={`${styles.row} ${me && r.entrant.playerIds.includes(me) ? styles.mine : ''}`}>
        <span className={styles.pos}>{r.label}</span>
        <span className={styles.name}>{r.entrant.isTeam ? words(r.entrant.name) : nameOf(r.playerId)}</span>
        <span className={styles.small}>{daysText(r.perRound)}</span>
        <span className={styles.big}>{r.figure.text}</span>
      </div>
    )
    return (
      <>
        {header(state.tournamentFinal ? `${settings.modules.individual.label}: ${t.common.final}` : settings.modules.individual.label)}
        <Rows>
          {top.map(row)}
          {shown.length > top.length && <div className={styles.gap} aria-hidden="true" />}
          {shown.length > top.length && row(mine!)}
        </Rows>
        {more(rows.length - shown.length)}
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
        {header(`${p.fullName}${row ? `, ${ordinal(row.label)}${row.entrant.isTeam ? ` con ${words(row.entrant.name)}` : ''}, ${t.common.figure(row.figure.text, row.figure.value, kind)}` : ''}`)}
        {state.core.roundIds.map((rid, i) => {
          const pr = state.core.rounds[rid]?.[p.id]
          if (!pr || pr.thru === 0) return null
          const day = row?.perRound[i]
          // His own card: in a team's strokes or points event his day is his own score; a match's day, a fourball side's too, is its result (STRAT-03).
          const dayFigure = row?.entrant.isTeam && kind !== 'match'
            ? ownDayText(pr, scoring)
            : scoring === 'points'
              ? t.common.figure(String(pr.points), pr.points, 'points')
              : !day || day.empty
                ? null
                : kind === 'match'
                  ? dayFigureText(day)
                  : t.common.figure(day.text, day.value, kind)
          return (
            <div key={rid} className={styles.round}>
              <div className={styles.roundTitle}>
                {[t.round.day(i + 1), `${t.live.playingHcp.toLowerCase()} ${pr.playingHcp}`, dayFigure, `${pr.putts} putts`].filter(Boolean).join(', ')}
              </div>
              <div className={styles.holes}>
                {pr.holes.map((h) => {
                  // Under strokes a hole is marked on the score the event counts, and shows no points.
                  const mark = holeMark(h, scoring)
                  return (
                    <div key={h.hole} className={`${styles.hole} ${mark === 'good' ? styles.birdie : mark === 'bad' ? styles.zero : ''}`}>
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
  // The settlement: who pays whom, as Dinero shows it (vía banco or sin banco), then each person's net.
  const money = state.money
  const banker = snapshot.tournament.bankerPlayerId
  const party = (id: string | null) => (id ? (byId.get(id)?.displayName ?? '?') : null)
  const lines = (what.settle === 'p2p' ? money.peerToPeer : money.viaBank).filter((tr) => tr.amount > 0)
  const people = snapshot.players.map((pl) => money.people[pl.id]!).filter(Boolean).sort((a, b) => b.net - a.net)
  const nets = people.slice(0, CARD_NETS)
  return (
    <>
      {header(`${t.moneyScreen.final}: ${state.tournamentFinal ? t.common.final : t.money.ifEndedNow}`)}
      <div className={styles.label}>{what.settle === 'p2p' ? t.moneyScreen.p2p : t.moneyScreen.viaBank}</div>
      <Rows>
        {lines.length === 0 && <div className={styles.transfer}>{t.moneyScreen.allSettled}</div>}
        {lines.slice(0, CARD_TRANSFERS).map((tr, i) => (
          <div key={`${i}|${tr.from}|${tr.to}`} className={styles.transfer}>
            <span>{t.moneyScreen.payText(t.moneyScreen.payWords(party(tr.from), party(tr.to), false, !!banker && ((tr.from === banker && tr.to === null) || (tr.from === null && tr.to === banker))))}</span>
            <span className={styles.amount}>{formatMoney(tr.amount, cur)}</span>
          </div>
        ))}
      </Rows>
      {more(lines.length - Math.min(lines.length, CARD_TRANSFERS))}
      <div className={styles.label}>{t.money.net}</div>
      <div className={styles.nets}>
        {nets.map((m) => (
          <div key={m.playerId} className={styles.net}>
            <span className={styles.name}>{nameOf(m.playerId)}</span>
            <span className={`${styles.amount} ${m.net > 0 ? styles.gain : m.net < 0 ? styles.loss : ''}`}>{formatSignedMoney(m.net, cur)}</span>
          </div>
        ))}
      </div>
      {more(people.length - nets.length)}
      {/* TRUST-12: the image travels on its own, so it says what Polo is and is not. */}
      <p className={styles.disclaimer}>{t.money.disclaimer}</p>
      {footer}
    </>
  )
}

function Rows({ children }: { children: ReactNode }) {
  return <div className={styles.rows}>{children}</div>
}

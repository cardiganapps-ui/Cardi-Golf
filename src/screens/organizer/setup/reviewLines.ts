/**
 * The wizard's review of the games, one line per game with what it pays
 * (UX-04).
 *
 * The review used to list `settings.games` and nothing else, so the
 * «Viaje con Calcutta» template, whose games are all modules (the pairs, the
 * snake, best round, fewest putts, the Calcutta), read «Juegos aparte:
 * Ninguno por ahora» right above «Crear torneo». The lines come from the
 * prize check, the same statement Comité › Torneo prints (PrizeSummary), so
 * the review can't name a game the check doesn't pay or miss one it does.
 * What the check leaves out on purpose is added after it: the Calcutta (its
 * own pot, paid from the auction), and games that play for no money.
 * Labels are the tournament's own (§0.5).
 */
import { t } from '../../../i18n/es-MX'
import type { PrizeCheck } from '../../../engine/settings/prizeCheck'
import type { Msg } from '../../../engine/messages'
import type { TournamentSettings } from '../../../engine/settings/schema'
import { formatMoney } from '../../../lib/money'
import { renderMsg } from '../../../i18n/explain'

export interface ReviewLine {
  key: string
  label: string
  value: string
  detail?: string
  /** A place nobody can take (MONEY-09): why «Crear» waits. */
  warn?: string
}

export function reviewGameLines(settings: TournamentSettings, check: PrizeCheck | null): ReviewLine[] {
  const cur = settings.currency
  const W = t.organizer.wizard
  const m = settings.modules
  const out: ReviewLine[] = []
  const words = (x: Msg) => renderMsg(x, cur)
  const unreachable = new Map((check?.unreachable ?? []).map((u) => [u.id, words(u.detail)]))
  if (check) {
    for (const l of check.lines) {
      out.push({
        key: l.moduleId,
        label: words(l.label),
        value: l.amount > 0 ? formatMoney(l.amount, cur) : W.reviewNoPrize,
        detail: l.amount > 0 ? words(l.detail) : undefined,
        warn: unreachable.get(l.moduleId),
      })
    }
    if (check.entryPot > 0) {
      out.push({
        key: 'total',
        label: W.reviewPrizes,
        value: formatMoney(check.prizesTotal, cur),
        detail: check.balanced ? W.reviewBalanced(formatMoney(check.entryPot, cur)) : t.admin.tournament.notBalanced(formatMoney(Math.abs(check.difference), cur)),
      })
    }
  } else {
    // Settings that don't parse have no statement; the review still names what is on.
    for (const id of ['individual', 'pairs', 'bestRound', 'snake', 'fewestPutts'] as const) {
      if (m[id].enabled) out.push({ key: id, label: m[id].label, value: W.reviewNoPrize })
    }
  }
  if (m.auction.enabled) {
    const slots = settings.auction.payout.map((s) => t.rules.slot(s.slot, 'place' in s ? s.place : undefined, 'tier' in s ? s.tier : undefined, s.share, settings.labels.lastPlace))
    out.push({ key: 'auction', label: m.auction.label, value: W.reviewAuctionPot, detail: W.reviewAuction(slots) })
  }
  for (const p of check?.sidePots ?? []) {
    out.push({ key: `side:${p.gameId}`, label: p.label, value: formatMoney(p.pot, cur), detail: W.reviewSidePot(words(p.detail)), warn: unreachable.get(`game:${p.gameId}`) })
  }
  for (const b of check?.bets ?? []) {
    out.push({ key: `bet:${b.gameId}`, label: b.label, value: W.reviewBet, detail: words(b.detail) })
  }
  // A game for the glory is in no statement; a game the check already wrote is not repeated.
  const listed = new Set(out.map((l) => l.key.replace(/^(side|bet):/, 'game:')))
  for (const g of settings.games) {
    if (g.enabled && !listed.has(`game:${g.id}`)) out.push({ key: `game:${g.id}`, label: g.label, value: W.reviewNoPrize })
  }
  return out
}

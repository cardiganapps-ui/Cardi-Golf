/**
 * What En vivo says before the first hole (STRAT-10; `PreRound.tsx` shows it): pure, from the boards and whose
 * phone this is, for the screen and its tests.
 */
import { t } from '../../i18n/es-MX'
import { collectible } from '../../engine/core/money'
import type { TournamentData } from '../../data/tournamentStore'
import type { Explanation, PaymentKind } from '../../engine/types'
import { formatMoney } from '../../lib/money'
import type { Until } from '../../lib/countdown'

const P = t.live.pre

export interface PreRoundInfo {
  roundId: string
  day: number
  days: number
  /** «viernes 9 de abril», when the day has a date. */
  date: string | null
  course: string | null
  /** Wall-clock date and the tee time the countdown aims at (his group's, else the day's first). */
  at: { date: string; time: string | null } | null
  group: { number: number; teeTime: string | null; startHole: number; with: string[] } | null
  /** He plays this day but is in no group yet. */
  noGroup: boolean
  /** The day's first tee time, for a phone that plays nobody. */
  firstTee: string | null
  tee: string | null
  hcp: { value: number; why: Explanation[] } | null
  /** null: the tournament moves no money for him. */
  owes: { total: number; parts: string[] } | null
}

/** True while nobody has a hole saved and a day is still to play: the board would be all zeros. */
export function isPreRound(data: TournamentData): boolean {
  const { snapshot } = data
  if (snapshot.tournament.status === 'finished') return false
  if (snapshot.scores.some((s) => s.strokes != null || s.pickedUp)) return false
  return snapshot.rounds.some((r) => r.status === 'scheduled' || r.status === 'live')
}

const dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** What the pre-round view says, from the boards and whose phone this is. Pure, for the tests. */
export function preRoundInfo(data: TournamentData, playerId: string | null, showMoney: boolean): PreRoundInfo | null {
  if (!isPreRound(data)) return null
  const { snapshot, state, settings } = data
  const playing = snapshot.rounds.filter((r) => r.status !== 'cancelled').sort((a, b) => a.number - b.number)
  const round = playing.find((r) => r.status === 'scheduled' || r.status === 'live')
  if (!round) return null
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const groups = snapshot.groups.filter((g) => g.roundId === round.id).sort((a, b) => a.number - b.number)
  const mine = playerId ? groups.find((g) => g.playerIds.includes(playerId)) : undefined
  const times = groups.map((g) => g.teeTime).filter((x): x is string => !!x).sort()
  const firstTee = times[0] ?? null
  const course = snapshot.courses.find((c) => c.id === round.courseId)?.name ?? null
  const pr = playerId ? state.core.rounds[round.id]?.[playerId] : undefined
  const base = playerId ? state.core.handicaps[playerId] : undefined
  // His handicap for the day, once the tournament has handicaps at all: from the base to the day's playing handicap.
  const hasHandicaps = Object.values(state.core.handicaps).some((h) => h.base > 0)
  const hcp = pr && hasHandicaps ? { value: pr.playingHcp, why: [base?.why, pr.playingHcpWhy].filter((w): w is Explanation => !!w) } : null

  let owes: PreRoundInfo['owes'] = null
  if (playerId && showMoney) {
    const mineAccounts = state.money.accounts.filter((a) => a.from === playerId && a.owed > 0)
    if (mineAccounts.length) {
      const label = (k: PaymentKind) =>
        k === 'entry' ? t.moneyScreen.owesEntry : k === 'calcutta' ? settings.modules.auction.label : k === 'buyback' ? t.moneyScreen.owesBuyback : k === 'side' ? t.moneyScreen.owesSide : t.moneyScreen.owesBet
      const byKind = new Map<PaymentKind, number>()
      for (const a of mineAccounts) if (collectible(a)) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + a.due)
      const total = [...byKind.values()].reduce((n, x) => n + x, 0)
      owes = { total, parts: [...byKind].map(([k, n]) => P.part(label(k), formatMoney(n))) }
    }
  }

  return {
    roundId: round.id,
    day: round.number,
    days: Math.max(settings.rounds, playing.length),
    date: round.date && /^\d{4}-\d{2}-\d{2}$/.test(round.date) ? dayFormat.format(new Date(`${round.date}T12:00:00Z`)) : null,
    course,
    at: round.date ? { date: round.date, time: mine?.teeTime ?? firstTee } : null,
    group: mine ? { number: mine.number, teeTime: mine.teeTime, startHole: mine.startHole, with: mine.playerIds.filter((id) => id !== playerId).map((id) => byId.get(id)?.displayName ?? '?') } : null,
    noGroup: !!playerId && !mine && !!byId.get(playerId),
    firstTee: mine ? null : firstTee,
    tee: pr?.tee?.name ?? null,
    hcp,
    owes,
  }
}

/** The countdown's words: null once the day is under way. */
export function countdownText(u: Until | null): string | null {
  if (!u || u.unit === 'started') return null
  if (u.unit === 'days') return P.days(u.n)
  if (u.unit === 'tomorrow') return P.tomorrow
  return u.hours == null || u.minutes == null ? P.today : P.todayIn(u.hours, u.minutes)
}

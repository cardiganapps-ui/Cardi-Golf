/**
 * The match-play bracket: who plays whom, round by round, and who is left.
 *
 * Nothing new is stored. A bracket round is a golf round, and the matches in
 * it are that round's groups — which is what `playMatches` already reads — so
 * the bracket is derived from the draw the Comité has already made, and the
 * Comité's only new job is "generate the next round's groups from the
 * winners", which this file computes for it.
 *
 * Seeding is by handicap, best first, and the first round pairs 1 v N,
 * 2 v N−1, and so on: the classic bracket, which keeps the two strongest
 * entrants apart until the final. A field that is not a power of two gives
 * the top seeds byes, so nobody plays two matches in a round while someone
 * else plays none.
 */
import type { Id } from '../types'
import type { Entrant, FormatContext } from './format'
import { playMatches, type MatchResult } from './matchPlay'
import { playerEntrants, teamEntrants } from './entrants'

export interface BracketMatch {
  /** Both sides, or one side and null for a bye. */
  sides: [Entrant, Entrant | null]
  /** The winner once the match is decided; a bye wins immediately. */
  winner: Entrant | null
  /** "3&2", "Iguales", "—". */
  text: string
  /** True when the pairing is what the bracket says should happen, but no group has been drawn for it. */
  pending: boolean
}

export interface BracketRound {
  /** The golf round this bracket round is played in, when one exists. */
  roundId: Id | null
  number: number
  /** "Octavos", "Cuartos", "Semifinal", "Final". */
  name: string
  matches: BracketMatch[]
}

export interface BracketState {
  rounds: BracketRound[]
  champion: Entrant | null
  /** Why the bracket cannot be read, if it cannot. */
  warnings: string[]
}

/** What a round with `n` matches is called. */
export function roundName(matches: number): string {
  if (matches === 1) return 'Final'
  if (matches === 2) return 'Semifinal'
  if (matches === 4) return 'Cuartos de final'
  if (matches === 8) return 'Octavos de final'
  return `Ronda de ${matches * 2}`
}

/**
 * Seed the field, best handicap first. Ties keep the roster's order, which is
 * the Comité's own, so seeding never moves on its own between reloads.
 */
export function seed(ctx: FormatContext, entrants: Entrant[]): Entrant[] {
  const hcp = (e: Entrant) => {
    const each = e.playerIds.map((id) => ctx.snapshot.players.find((p) => p.id === id)?.baseHcp ?? 54)
    return each.length ? each.reduce((s, x) => s + x, 0) / each.length : 54
  }
  const order = new Map(entrants.map((e, i) => [e.id, i]))
  return [...entrants].sort((a, b) => hcp(a) - hcp(b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

/**
 * The first round's pairings: 1 v N, 2 v N−1, … padded up to a power of two
 * with byes, which fall to the top seeds.
 */
export function firstRound(seeded: Entrant[]): Array<[Entrant, Entrant | null]> {
  const n = seeded.length
  if (n < 2) return []
  let size = 1
  while (size < n) size *= 2
  const slots: Array<Entrant | null> = [...seeded, ...Array.from({ length: size - n }, () => null)]
  const pairs: Array<[Entrant, Entrant | null]> = []
  for (let i = 0; i < size / 2; i++) {
    const a = slots[i] ?? null
    const b = slots[size - 1 - i] ?? null
    // A bye's slot is null; the seeded side is always first.
    if (a) pairs.push([a, b])
  }
  return pairs
}

/** The next round's pairings: winners meet in the order their matches sat in. */
export function advance(winners: Array<Entrant | null>): Array<[Entrant, Entrant | null]> {
  const out: Array<[Entrant, Entrant | null]> = []
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const a = winners[i]
    const b = winners[i + 1]
    if (a) out.push([a, b ?? null])
    else if (b) out.push([b, null])
  }
  if (winners.length % 2 === 1) {
    const last = winners[winners.length - 1]
    if (last) out.push([last, null])
  }
  return out
}

/** The match actually played between two sides in a round, if there was one. */
function playedMatch(results: MatchResult[], roundId: Id, a: Entrant, b: Entrant | null): MatchResult | undefined {
  if (!b) return undefined
  return results.find((r) => r.roundId === roundId && r.sideId === a.id && r.opponentId === b.id)
}

/**
 * Read the whole bracket. Rounds the field has not reached yet are still
 * listed, with the pairings the bracket implies, so everyone can see who
 * they would meet.
 */
export function bracketState(ctx: FormatContext): BracketState {
  const o = ctx.settings.modules.individual.formatOptions
  const fourball = o.matchMode === 'fourball'
  const entrants = fourball ? teamEntrants(ctx) : playerEntrants(ctx)
  const warnings: string[] = []
  if (entrants.length < 2) return { rounds: [], champion: null, warnings: ['Todavía no hay suficientes jugadores para armar el cuadro.'] }

  const { results } = playMatches(ctx, entrants, fourball, o.scoring !== 'gross')
  const roundIds = ctx.core.roundIds
  const rounds: BracketRound[] = []
  let pairings = firstRound(seed(ctx, entrants))
  let champion: Entrant | null = null

  for (let i = 0; pairings.length > 0; i++) {
    const roundId = roundIds[i] ?? null
    const matches: BracketMatch[] = pairings.map(([a, b]) => {
      // A bye is won before anyone tees off.
      if (!b) return { sides: [a, null] as [Entrant, null], winner: a, text: 'Pasa directo', pending: false }
      const played = roundId ? playedMatch(results, roundId, a, b) : undefined
      if (!played) return { sides: [a, b] as [Entrant, Entrant], winner: null, text: '—', pending: true }
      const winner = !played.done ? null : played.up > 0 ? a : played.up < 0 ? b : null
      return { sides: [a, b] as [Entrant, Entrant], winner, text: played.text, pending: false }
    })
    rounds.push({ roundId, number: i + 1, name: roundName(matches.length), matches })

    if (matches.length === 1) {
      champion = matches[0]!.winner
      break
    }
    if (matches.some((m) => !m.winner)) {
      // The round is not finished, so who plays next is not known yet. The
      // bracket stops here rather than inventing pairings.
      if (matches.some((m) => !m.pending && !m.winner)) warnings.push(`${roundName(matches.length)}: hay un partido empatado; el Comité decide quién pasa.`)
      break
    }
    pairings = advance(matches.map((m) => m.winner))
  }

  if (roundIds.length < rounds.length) {
    warnings.push(`El cuadro necesita ${rounds.length} ${rounds.length === 1 ? 'ronda' : 'rondas'} y el torneo tiene ${roundIds.length}.`)
  }
  return { rounds, champion, warnings }
}

/**
 * The groups the next unplayed bracket round needs: one group per match, the
 * two sides together. This is what Comité › Grupos writes.
 */
export function nextRoundGroups(state: BracketState): { round: BracketRound; groups: Id[][] } | null {
  const round = state.rounds.find((r) => r.matches.some((m) => m.pending))
  if (!round) return null
  return {
    round,
    groups: round.matches.filter((m) => m.sides[1]).map((m) => [...m.sides[0].playerIds, ...(m.sides[1]?.playerIds ?? [])]),
  }
}

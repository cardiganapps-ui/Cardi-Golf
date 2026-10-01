/**
 * Match play: hole against hole, not stroke against stroke.
 *
 * A match is a group. That is how golf actually draws it — your opponent is
 * the person you tee off with — so the Comité needs no second screen: singles
 * is a group of two, fourball a group of four that splits into the two pairs
 * it already drew. A group that fits neither says so in a warning instead of
 * scoring something wrong quietly.
 *
 * The standings rank on match points: a win is 1, a half is ½, a loss is 0.
 */
import type { CountbackInput } from '../core/ranking'
import type { TournamentSettings } from '../settings/schema'
import type { Explanation, Id } from '../types'
import { playerEntrants, teamEntrants } from './entrants'
import type { Entrant, Figure, FormatContext, FormatStandings, MainFormat } from './format'
import { holeStrokes } from './strokePlay'

/** Where a match stood, from one side's point of view. */
export interface MatchResult {
  roundId: Id
  groupId: Id
  sideId: Id
  opponentId: Id
  /** Holes won minus holes lost, from this side. */
  up: number
  /** Holes still to play. */
  toPlay: number
  played: number
  /** Decided: one side is further up than there are holes left. */
  done: boolean
  /** 1 win, 0.5 half, 0 loss; null while it is still alive. */
  points: number | null
  /** "3&2", "1 up", "Empate", "2 abajo". */
  text: string
}

/** The pair of sides in a group, or null when the group is not a match. */
function sidesOf(groupPlayerIds: Id[], entrants: Entrant[], fourball: boolean): [Entrant, Entrant] | null {
  if (fourball) {
    const inGroup = entrants.filter((e) => e.playerIds.every((p) => groupPlayerIds.includes(p)))
    return inGroup.length === 2 ? [inGroup[0]!, inGroup[1]!] : null
  }
  if (groupPlayerIds.length !== 2) return null
  const a = entrants.find((e) => e.id === groupPlayerIds[0])
  const b = entrants.find((e) => e.id === groupPlayerIds[1])
  return a && b ? [a, b] : null
}

/** A side's score on one hole: its only ball, or the better of two. */
function sideHole(ctx: FormatContext, roundId: Id, side: Entrant, hole: number, net: boolean): number | null {
  const scores: number[] = []
  for (const playerId of side.playerIds) {
    const h = ctx.core.rounds[roundId]?.[playerId]?.holes.find((x) => x.hole === hole)
    const s = h ? holeStrokes(h, net) : null
    if (s != null) scores.push(s)
  }
  return scores.length ? Math.min(...scores) : null
}

/**
 * How a match reads, from `up`'s point of view.
 *
 * A finished match reads the same on both sides — "3&2" is the score of the
 * match, not of a player — because the points column already says who won it
 * and the figure carries the colour. While it is still alive there is no
 * points column to lean on, so those read "2 arriba" and "2 abajo".
 */
function resultText(up: number, toPlay: number, done: boolean): string {
  if (done) {
    if (up === 0) return 'Empate'
    const by = Math.abs(up)
    return toPlay > 0 ? `${by}&${toPlay}` : `${by} arriba`
  }
  if (up === 0) return 'Iguales'
  return up > 0 ? `${up} arriba` : `${-up} abajo`
}

/** Play every match in every round, from both sides. */
export function playMatches(ctx: FormatContext, entrants: Entrant[], fourball: boolean, net: boolean): { results: MatchResult[]; warnings: string[] } {
  const results: MatchResult[] = []
  const warnings: string[] = []
  for (const roundId of ctx.core.roundIds) {
    const round = ctx.snapshot.rounds.find((r) => r.id === roundId)
    const holes = round?.holes ?? 18
    for (const group of ctx.snapshot.groups.filter((g) => g.roundId === roundId)) {
      const sides = sidesOf(group.playerIds, entrants, fourball)
      if (!sides) {
        warnings.push(
          fourball
            ? `Día ${round?.number ?? '?'}, grupo ${group.number}: un fourball necesita dos parejas ya sorteadas en ese grupo.`
            : `Día ${round?.number ?? '?'}, grupo ${group.number}: un partido individual necesita exactamente dos jugadores.`,
        )
        continue
      }
      const [a, b] = sides
      let up = 0
      let played = 0
      let decidedAt: number | null = null
      for (let hole = 1; hole <= holes; hole++) {
        const sa = sideHole(ctx, roundId, a, hole, net)
        const sb = sideHole(ctx, roundId, b, hole, net)
        if (sa == null || sb == null) continue
        played++
        if (sa < sb) up++
        else if (sb < sa) up--
        // Decided the moment one side leads by more holes than remain — and
        // then the match is over. Holes after that are not played, so a 3&2 win
        // stays 3&2 even if the loser has scores on 17 and 18 (a group that
        // plays them out for a side bet, or the Comité entering a full card).
        if (Math.abs(up) > holes - played) {
          decidedAt = played
          break
        }
      }
      const toPlay = holes - (decidedAt ?? played)
      const complete = played === holes
      const done = decidedAt != null || complete
      const points = !done ? null : up > 0 ? 1 : up < 0 ? 0 : 0.5
      results.push({ roundId, groupId: group.id, sideId: a.id, opponentId: b.id, up, toPlay, played, done, points, text: resultText(up, toPlay, done) })
      results.push({ roundId, groupId: group.id, sideId: b.id, opponentId: a.id, up: -up, toPlay, played, done, points: points == null ? null : 1 - points, text: resultText(-up, toPlay, done) })
    }
  }
  return { results, warnings }
}

/** "2½", "1", "0" — match points read the way golf writes them. */
export function matchPointsText(points: number): string {
  const whole = Math.floor(points)
  const half = points - whole >= 0.5
  if (!half) return String(whole)
  return whole === 0 ? '½' : `${whole}½`
}

export const matchPlayFormat: MainFormat = {
  id: 'matchPlay',
  defaultLabel: 'Match play',
  higherIsBetter: () => true,
  figureLabel: () => 'Puntos',

  describe(settings: TournamentSettings): Explanation {
    const o = settings.modules.individual.formatOptions
    const fourball = o.matchMode === 'fourball'
    return {
      title: fourball ? 'Match play, fourball' : 'Match play, individual',
      steps: [
        fourball
          ? 'Dos parejas por grupo. En cada hoyo cuenta la mejor bola de cada pareja.'
          : 'Uno contra uno: el grupo de dos jugadores es el partido.',
        'Gana el hoyo quien menos golpes haga; el partido se gana por hoyos, no por golpes.',
        o.scoring === 'gross' ? 'Sin hándicap: palo contra palo.' : 'Con los golpes de ventaja de cada quien.',
        'Un partido ganado vale 1 punto, uno empatado ½, uno perdido 0.',
        'El partido se acaba cuando alguien va más arriba que los hoyos que quedan: eso es un «3&2».',
      ],
    }
  },

  standings(ctx: FormatContext): FormatStandings {
    const o = ctx.settings.modules.individual.formatOptions
    const fourball = o.matchMode === 'fourball'
    const net = o.scoring !== 'gross'
    const entrants = fourball ? teamEntrants(ctx) : playerEntrants(ctx)
    const { results, warnings } = playMatches(ctx, entrants, fourball, net)

    const totals: FormatStandings['totals'] = {}
    const perRound: FormatStandings['perRound'] = {}
    const thru: FormatStandings['thru'] = {}
    const countback: FormatStandings['countback'] = {}

    for (const e of entrants) {
      const mine = results.filter((r) => r.sideId === e.id)
      const decided = mine.filter((r) => r.points != null)
      const points = decided.reduce((s, r) => s + (r.points ?? 0), 0)
      const played = mine.reduce((s, r) => s + r.played, 0)
      totals[e.id] = mine.length === 0 || played === 0 ? { value: 0, text: '—', empty: true } : { value: points, text: matchPointsText(points) }
      thru[e.id] = played

      const byRound: Record<string, Figure> = {}
      for (const rid of ctx.core.roundIds) {
        const r = mine.find((x) => x.roundId === rid)
        byRound[rid] = r && r.played > 0 ? { value: r.points ?? 0, text: r.text, tone: r.up > 0 ? 'under' : r.up < 0 ? 'over' : undefined } : { value: 0, text: '—', empty: true }
      }
      perRound[e.id] = byRound

      // Countback on a tie: who won more holes in the last round.
      const last = ctx.core.roundIds.at(-1)
      const lastMatch = last ? mine.find((x) => x.roundId === last) : undefined
      const map: CountbackInput = { pointsByHole: new Map(), holes: 18 }
      if (lastMatch) map.pointsByHole.set(1, lastMatch.up)
      countback[e.id] = map
    }

    return { entrants, totals, perRound, thru, countback, warnings }
  },
}

/**
 * Match play and Nassau between two sides (one player each, or pairs).
 *
 * Each match is played once per round the game covers. On every hole the
 * lower side score wins the hole: singles compare each player's score;
 * pairs use the best ball or the pair's combined score (a picked-up hole is
 * net double bogey in the combined score, no score in best ball). No score
 * against a score loses the hole; two no-scores halve it.
 *
 * Nassau is three bets per round: front 9, back 9 and the 18. With presses
 * on, when the latest bet of a segment reaches `pressAt` holes down, a new
 * bet (a press) starts on the next hole, up to `maxPresses` per segment.
 * Holes are taken in the order the group plays them (start hole 10 plays the
 * back nine first). Every bet pays `stake`: each player of the losing side
 * pays the player in the same position on the winning side.
 */
import { playOrder } from '../../core/playOrder'
import { isFinal } from '../../core/ranking'
import type { GameOf, Match } from '../../settings/games'
import { msg, say, type Msg } from '../../messages'
import type { Id } from '../../types'
import type { BoardRow, BoardSection, GameContext, GameImpl } from '../game'
import { netBets } from '../payout'
import { holeOf, holeScore, moneyByPlayer, namer, roundHoles, roundNumberOf } from '../util'

type Cfg = GameOf<'match'>

export interface MatchBet {
  /** 0 = the original bet, 1.. = presses. */
  press: number
  /** First hole of the bet. */
  fromHole: number
  /** Holes up for side A (negative = side B up). */
  up: number
  /** Holes left in the bet. */
  remaining: number
  /** Decided early (more up than holes left) or played out. */
  decided: boolean
}

export interface MatchSegment {
  key: 'front' | 'back' | 'total'
  /** «Ida», «Vuelta», «Total», «Partido», «9 hoyos» (`match.segment`). */
  label: Msg
  /** Hole results in play order: 1 = side A wins, −1 = side B, 0 = halved, null = not yet. */
  results: Array<{ hole: number; r: 1 | 0 | -1 | null }>
  bets: MatchBet[]
  thru: number
}

export interface MatchRound {
  matchId: string
  roundId: Id
  roundNumber: number
  a: Id[]
  b: Id[]
  segments: MatchSegment[]
}

export interface MatchState {
  rounds: MatchRound[]
  /** Matches naming players who are not entrants (ignored). */
  invalid: string[]
}

function sideScore(
  ctx: GameContext<Cfg>,
  rid: Id,
  side: Id[],
  hole: number,
  final: boolean,
): { ready: boolean; v: number | null } {
  const { basis, pairScoring } = ctx.config.options
  const hs = side.map((id) => holeOf(ctx, rid, id, hole))
  const ready = final || hs.every((h) => h?.played)
  if (!ready) return { ready, v: null }
  if (side.length > 1 && pairScoring === 'aggregate') {
    let sum = 0
    for (const h of hs) {
      if (!h?.played) return { ready, v: null }
      const gross = h.pickedUp || h.gross == null ? h.par + h.strokesReceived + 2 : h.gross
      sum += basis === 'gross' ? gross : gross - h.strokesReceived
    }
    return { ready, v: sum }
  }
  const vals = hs.map((h) => holeScore(h, basis)).filter((v): v is number => v != null)
  return { ready, v: vals.length ? Math.min(...vals) : null }
}

function segmentsFor(
  holes: number,
  format: Cfg['options']['format'],
): Array<{ key: MatchSegment['key']; label: Msg; holes: number[] }> {
  const all = Array.from({ length: holes }, (_, i) => i + 1)
  if (format === 'match' || holes < 18)
    return [{ key: 'total', label: msg('match.segment', { key: 'match', holes }), holes: all }]
  return [
    { key: 'front', label: msg('match.segment', { key: 'front', holes }), holes: all.slice(0, 9) },
    { key: 'back', label: msg('match.segment', { key: 'back', holes }), holes: all.slice(9) },
    { key: 'total', label: msg('match.segment', { key: 'total', holes }), holes: all },
  ]
}

function playRound(ctx: GameContext<Cfg>, m: Match, rid: Id): MatchRound {
  const final = isFinal(ctx, 'roundsOrTournament', [rid])
  const holes = roundHoles(ctx, rid)
  const group = ctx.snapshot.groups.find((g) => g.roundId === rid && g.playerIds.includes(m.a[0]!))
  const order = playOrder(group?.startHole ?? 1, holes)
  const { pressAt, maxPresses } = ctx.config.options
  const segments = segmentsFor(holes, ctx.config.options.format).map((seg) => {
    const seq = order.filter((h) => seg.holes.includes(h))
    const results: MatchSegment['results'] = []
    const bets: MatchBet[] = [{ press: 0, fromHole: seq[0]!, up: 0, remaining: seq.length, decided: false }]
    const starts = [0]
    let open = true
    seq.forEach((hole, i) => {
      if (!open) return void results.push({ hole, r: null })
      const a = sideScore(ctx, rid, m.a, hole, final)
      const b = sideScore(ctx, rid, m.b, hole, final)
      if (!a.ready || !b.ready) {
        // Presses depend on the order of holes: stop at the first hole not yet played.
        open = false
        return void results.push({ hole, r: null })
      }
      const r: 1 | 0 | -1 = a.v === b.v ? 0 : a.v == null ? -1 : b.v == null ? 1 : a.v < b.v ? 1 : -1
      results.push({ hole, r })
      bets.forEach((bet, k) => {
        if (i < starts[k]! || bet.decided) return
        bet.up += r
        bet.remaining = seq.length - 1 - i
        if (Math.abs(bet.up) > bet.remaining || bet.remaining === 0) bet.decided = true
      })
      const latest = bets[bets.length - 1]!
      if (pressAt > 0 && bets.length - 1 < maxPresses && Math.abs(latest.up) >= pressAt && i < seq.length - 1) {
        bets.push({ press: bets.length, fromHole: seq[i + 1]!, up: 0, remaining: seq.length - 1 - i, decided: false })
        starts.push(i + 1)
      }
    })
    const thru = results.filter((x) => x.r != null).length
    if (final) for (const bet of bets) bet.decided = true
    return { key: seg.key, label: seg.label, results, bets, thru }
  })
  return { matchId: m.id, roundId: rid, roundNumber: roundNumberOf(ctx, rid), a: m.a, b: m.b, segments }
}

export const matchGame: GameImpl<MatchState, Cfg> = {
  type: 'match',
  defaultLabel: 'Nassau',
  compute(ctx) {
    const inGame = new Set(ctx.entrants)
    const invalid: string[] = []
    const rounds: MatchRound[] = []
    for (const m of ctx.config.options.matches) {
      if (![...m.a, ...m.b].every((id) => inGame.has(id)) || m.a.length !== m.b.length) {
        invalid.push(m.id)
        continue
      }
      for (const rid of ctx.roundIds) rounds.push(playRound(ctx, m, rid))
    }
    return { rounds, invalid }
  },
  prizes(state, ctx) {
    const stake = ctx.config.money.stake
    if (ctx.config.money.source !== 'direct' || stake <= 0) return []
    const name = namer(ctx)
    const owed = new Map<string, number>()
    const lines = new Map<string, Msg[]>()
    const multi = ctx.roundIds.length > 1
    for (const mr of state.rounds) {
      for (const seg of mr.segments) {
        for (const bet of seg.bets) {
          if (bet.up === 0) continue
          const [win, lose] = bet.up > 0 ? [mr.a, mr.b] : [mr.b, mr.a]
          win.forEach((w, i) => {
            const payer = lose[i]!
            const k = `${payer}|${w}`
            owed.set(k, (owed.get(k) ?? 0) + stake)
            const line = msg('match.bet', {
              day: multi ? mr.roundNumber : null,
              segment: seg.label,
              press: bet.press,
              from: bet.fromHole,
              side: win.map(name),
              up: Math.abs(bet.up),
              decided: bet.decided,
              stake,
            })
            lines.set(k, [...(lines.get(k) ?? []), line])
          })
        }
      }
    }
    return netBets(ctx, owed, (payer, winner) => lines.get(`${payer}|${winner}`) ?? [], name).map((p) => ({
      ...p,
      final: ctx.final && state.rounds.every((mr) => mr.segments.every((s) => s.bets.every((b) => b.decided))),
    }))
  },
  board(state, ctx) {
    const name = namer(ctx)
    const money = moneyByPlayer(matchGame.prizes(state, ctx))
    const multi = ctx.roundIds.length > 1
    const sections: BoardSection[] = state.rounds.map((mr) => {
      const rows: BoardRow[] = mr.segments.map((seg) => {
        const lead = seg.bets[0]!.up
        const leaders = lead > 0 ? mr.a : lead < 0 ? mr.b : []
        return {
          title: seg.label,
          playerIds: leaders,
          pos: null,
          figure: statusText(seg.bets[0]!, leaders.length > 1),
          sub: msg('board.matchThru', {
            thru: seg.thru,
            presses: seg.bets.slice(1).map((b) => ({ from: b.fromHole, status: pressText(b, mr, name) })),
          }),
        }
      })
      const aSum = sum(mr.a, money)
      if (aSum !== 0)
        rows.push({
          title: say('board.matchMoney'),
          playerIds: aSum > 0 ? mr.a : mr.b,
          pos: null,
          figure: msg('board.signedMoney', { amount: Math.abs(aSum) }),
          sub: msg('board.matchPays', { side: (aSum > 0 ? mr.b : mr.a).map(name) }),
        })
      return {
        title: msg('board.matchTitle', { day: multi ? mr.roundNumber : null, a: mr.a.map(name), b: mr.b.map(name) }),
        rows,
      }
    })
    const o = ctx.config.options
    const notes: Msg[] = [
      msg('board.matchRule', { nassau: o.format === 'nassau', net: o.basis === 'net', stake: ctx.config.money.stake }),
    ]
    if (o.pressAt > 0) notes.push(msg('board.matchPressRule', { at: o.pressAt, max: o.maxPresses }))
    if (!o.matches.length) notes.push(say('board.noMatches'))
    return { sections, notes }
  },
  warnings(state, ctx) {
    return state.invalid.length ? [msg('match.invalid', { label: ctx.config.label, n: state.invalid.length })] : []
  },
}

/** `plural`: a side of two or more wins («Iván J. y Julián ganan 1 arriba», COPY-23: «gana»). */
function statusText(bet: MatchBet, plural = false): Msg {
  return msg('board.matchStatus', { up: bet.up, decided: bet.decided, remaining: bet.remaining, plural })
}

/** A press's standing, led by the side that is up. */
function pressText(bet: MatchBet, mr: MatchRound, name: (id: Id) => string): Msg {
  return msg('board.matchPress', {
    side: bet.up === 0 ? null : (bet.up > 0 ? mr.a : mr.b).map(name),
    up: bet.up,
    decided: bet.decided,
    remaining: bet.remaining,
  })
}

function sum(ids: Id[], money: Map<Id, number>): number {
  return ids.reduce((s, id) => s + (money.get(id) ?? 0), 0)
}

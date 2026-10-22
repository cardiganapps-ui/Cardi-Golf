/**
 * Pairs game (§5.5, "Los Matrimonios" in the first tournament): fixed pairs,
 * pair score = sum of both partners' points on every hole. Tie: better
 * combined last round, then split. Also validates group composition and
 * generates the next round's groups from the standings.
 */
import { label as named, msg, say, type Msg } from '../../messages'
import {
  flattenRanks,
  isFinal,
  onlyWithResult,
  rankField,
  splitEven,
  splitPrizes,
  unfilledPlaces,
  unfilledWarning,
  type RankGroup,
} from '../../core/ranking'
import type { Explanation, Id, Pair, Player } from '../../types'
import type { GameModule, ModuleContext, PrizeAward } from '../module'
import { prizeLabel } from '../../games/game'

export interface PairRow {
  pairId: Id
  /** Its name, or its two players' when it has none (`name.pair`). */
  name: Msg
  playerIds: [Id, Id]
  kind: string | null
  position: number
  tied: boolean
  label: string
  total: number
  perRound: number[]
  thru: number
}

export interface PairsState {
  rows: PairRow[]
  groups: RankGroup<Id>[]
  prizes: Record<Id, { amount: number; why: Explanation; pairId: Id }>
  /** Players without a pair (warning, not an error). */
  unpaired: Id[]
  /** Groups that are not one pair of each kind (§18.5: keep the order, warn). */
  groupWarnings: Array<{ roundId: Id; groupId: Id; message: Msg }>
  /** Once final, the places with a prize no pair with a result filled (MONEY-09). */
  warnings: Msg[]
  final: boolean
}

/** Which pairing rule (e.g. "AD") a pair of tiers belongs to, or null. */
export function pairingKind(
  pairing: Array<[string, string]>,
  tierA: string | null,
  tierB: string | null,
): string | null {
  for (const [x, y] of pairing) {
    if ((tierA === x && tierB === y) || (tierA === y && tierB === x)) return `${x}${y}`
  }
  return null
}

function pairPoints(ctx: ModuleContext, pair: Pair, roundId: Id): number {
  const r = ctx.core.rounds[roundId] ?? {}
  return (r[pair.player1Id]?.points ?? 0) + (r[pair.player2Id]?.points ?? 0)
}

export function checkGroupComposition(ctx: ModuleContext, groupPlayerIds: Id[]): { ok: boolean; message: Msg | null } {
  const pairs = ctx.snapshot.pairs
  const kinds = ctx.settings.modules.pairs.pairing.map(([x, y]) => `${x}${y}`)
  const inGroup = new Set(groupPlayerIds)
  const found = pairs.filter((p) => inGroup.has(p.player1Id) && inGroup.has(p.player2Id))
  if (found.length * 2 !== groupPlayerIds.length) {
    return { ok: false, message: say('pairs.notPairs') }
  }
  const foundKinds = found.map((p) => p.kind ?? '').sort()
  if (kinds.length && kinds.length === found.length && foundKinds.join(',') !== [...kinds].sort().join(',')) {
    return { ok: false, message: msg('pairs.wrongKinds', { kinds }) }
  }
  return { ok: true, message: null }
}

/**
 * Next-round groups from the standings (§5.5): rank pairs, then the last
 * group holds the top two pairs. With 6 pairs and 2 per group: (5,6), (3,4), (1,2).
 * Odd leftovers form a smaller first group.
 */
export function generateGroupsFromStandings(rankedPairIds: Id[], pairsPerGroup = 2): Id[][] {
  const groups: Id[][] = []
  const ids = [...rankedPairIds]
  while (ids.length) {
    // Take from the bottom: the worst `pairsPerGroup` pairs go out first.
    const chunk = ids.splice(Math.max(0, ids.length - pairsPerGroup), pairsPerGroup)
    groups.push(chunk.sort((a, b) => rankedPairIds.indexOf(a) - rankedPairIds.indexOf(b)))
  }
  return groups
}

export const pairsModule: GameModule<PairsState, 'pairs'> = {
  id: 'pairs',
  defaultLabel: 'Parejas',
  compute(ctx) {
    const { snapshot, core, settings } = ctx
    const playersById = new Map<Id, Player>(snapshot.players.map((p) => [p.id, p]))
    const pairs = snapshot.pairs.filter((p) => playersById.has(p.player1Id) && playersById.has(p.player2Id))
    const lastRound = core.roundIds.at(-1)
    const total = (p: Pair) => core.roundIds.reduce((s, rid) => s + pairPoints(ctx, p, rid), 0)
    const byId = new Map(pairs.map((p) => [p.id, p]))
    // Total, then the better combined last round (§5.5), then the tied share.
    const groups = rankField(
      pairs.map((p) => p.id),
      {
        keys: [(id) => total(byId.get(id)!), (id) => (lastRound ? pairPoints(ctx, byId.get(id)!, lastRound) : 0)],
        ties: 'share',
        order: (a, b) => a.localeCompare(b),
      },
    )
    const nameOfPair = (id: Id) => {
      const p = byId.get(id)!
      return p.name != null
        ? named(p.name)
        : msg('name.pair', { names: [p.player1Id, p.player2Id].map((id) => playersById.get(id)?.displayName ?? id) })
    }
    const rows: PairRow[] = flattenRanks(groups).map((r) => {
      const p = byId.get(r.item)!
      return {
        pairId: p.id,
        name: nameOfPair(p.id),
        playerIds: [p.player1Id, p.player2Id],
        kind: p.kind,
        position: r.position,
        tied: r.tied,
        label: r.label,
        total: total(p),
        perRound: core.roundIds.map((rid) => pairPoints(ctx, p, rid)),
        thru: Math.min(core.totals[p.player1Id]?.thru ?? 0, core.totals[p.player2Id]?.thru ?? 0),
      }
    })
    const prizes: PairsState['prizes'] = {}
    const anyScores = Object.values(core.totals).some((t) => t.thru > 0)
    // A pair neither of whom played a hole takes no paid place (MONEY-09).
    const paid = onlyWithResult(groups, (id) => {
      const p = byId.get(id)!
      return (core.totals[p.player1Id]?.thru ?? 0) + (core.totals[p.player2Id]?.thru ?? 0) > 0
    })
    for (const s of anyScores || ctx.tournamentFinal ? splitPrizes(paid, settings.prizes.pairs, nameOfPair) : []) {
      const p = byId.get(s.item)!
      const [first, second] = splitEven(s.amount, 2)
      const each = second!.amount
      const odd = first!.rounding
      const why: Explanation = {
        title: msg('pairs.eachTitle', { each }),
        steps: [
          ...s.why.steps,
          msg('pairs.split', { total: s.amount, each, odd, to: playersById.get(p.player1Id)?.displayName ?? '' }),
        ],
      }
      prizes[p.player1Id] = {
        amount: first!.amount,
        why: odd ? { ...why, title: msg('amount', { amount: first!.amount }) } : why,
        pairId: p.id,
      }
      prizes[p.player2Id] = { amount: each, why, pairId: p.id }
    }
    const paired = new Set(pairs.flatMap((p) => [p.player1Id, p.player2Id]))
    const unpaired = snapshot.players.filter((p) => !paired.has(p.id)).map((p) => p.id)
    const groupWarnings: PairsState['groupWarnings'] = []
    if (pairs.length) {
      for (const g of snapshot.groups) {
        const c = checkGroupComposition(ctx, g.playerIds)
        if (!c.ok && c.message) groupWarnings.push({ roundId: g.roundId, groupId: g.id, message: c.message })
      }
    }
    const warnings = ctx.tournamentFinal
      ? unfilledWarning(
          settings.modules.pairs.label,
          unfilledPlaces(paid, settings.prizes.pairs),
          paid.reduce((n, g) => n + g.members.length, 0),
          'pair',
        )
      : []
    return { rows, groups, prizes, unpaired, groupWarnings, warnings, final: isFinal(ctx, 'tournament') }
  },
  /** Its places nobody filled; the groups' composition is a field warning (`groupWarnings`), not its money's. */
  warnings(state) {
    return state.warnings
  },
  prizes(state, ctx) {
    const label = ctx.settings.modules.pairs.label
    const out: PrizeAward[] = []
    for (const [playerId, p] of Object.entries(state.prizes)) {
      const row = state.rows.find((r) => r.pairId === p.pairId)
      out.push({
        moduleId: 'pairs',
        ...prizeLabel(label, msg('part.place', { place: row?.label ?? '' })),
        playerId,
        amount: p.amount,
        final: state.final,
        why: p.why,
      })
    }
    return out
  },
}

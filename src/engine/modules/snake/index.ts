/**
 * The snake (§5.6, "La Víbora"): per group, per round. The snake belongs to
 * whoever most recently took `puttsThreshold`+ putts, processing holes in
 * the group's play order. Two or more on the same hole → the one who holed
 * out last (a stored tiebreak answer), else "pendiente".
 */
import { playOrder } from '../../core/playOrder'
import type { Explanation, Id } from '../../types'
import type { GameModule, PrizeAward } from '../module'

export interface SnakePass {
  hole: number
  /** Order in which the group played it (1-based). */
  playOrderIndex: number
  /** Players who reached the threshold on this hole. */
  candidates: Id[]
  /** New holder, or null while a tiebreak is pending. */
  holderId: Id | null
  pending: boolean
}

export interface SnakeGroupState {
  roundId: Id
  roundNumber: number
  groupId: Id
  groupNumber: number
  playerIds: Id[]
  passes: SnakePass[]
  holderId: Id | null
  /** The hole where a tiebreak answer is still missing, if any. */
  pendingHole: number | null
  /** Every player has completed the round (or the round is finished). */
  finished: boolean
  /** Pot for this group this round. */
  pot: number
  /** Only once finished and not pending. */
  payouts: Record<Id, { amount: number; why: Explanation }>
  final: boolean
}

export interface SnakeState {
  groups: SnakeGroupState[]
  /** Group-rounds waiting for "¿Quién embocó al último?". */
  pending: Array<{ roundId: Id; groupId: Id; hole: number; candidates: Id[] }>
  /** playerId → holes spent holding the snake (for the awards). */
  holesHeld: Record<Id, number>
}

export const snakeModule: GameModule<SnakeState> = {
  id: 'snake',
  defaultLabel: 'La Víbora',
  compute(ctx) {
    const { snapshot, core, settings } = ctx
    const threshold = settings.modules.snake.puttsThreshold
    const perSurvivor = settings.prizes.snakePerSurvivor
    const nameOf = (id: Id) => snapshot.players.find((p) => p.id === id)?.displayName ?? id
    const groups: SnakeGroupState[] = []
    const pending: SnakeState['pending'] = []
    const holesHeld: Record<Id, number> = {}
    for (const p of snapshot.players) holesHeld[p.id] = 0

    for (const rid of core.roundIds) {
      const round = snapshot.rounds.find((r) => r.id === rid)!
      const byPlayer = core.rounds[rid] ?? {}
      for (const g of snapshot.groups.filter((x) => x.roundId === rid).sort((a, b) => a.number - b.number)) {
        const order = playOrder(g.startHole, round.holes)
        const passes: SnakePass[] = []
        let holderId: Id | null = null
        let pendingHole: number | null = null
        let stuck = false
        // A player who picked up counts only if he actually entered ≥ threshold putts (§18.1).
        order.forEach((hole, idx) => {
          const candidates = g.playerIds.filter((pid) => {
            const h = byPlayer[pid]?.holes[hole - 1]
            return h?.played && h.putts != null && h.putts >= threshold
          })
          // Track holes held (the holder at the start of a hole holds it through that hole).
          if (holderId && !stuck) holesHeld[holderId] = (holesHeld[holderId] ?? 0) + 1
          if (candidates.length === 0) return
          if (stuck) {
            passes.push({ hole, playOrderIndex: idx + 1, candidates, holderId: null, pending: true })
            return
          }
          if (candidates.length === 1) {
            holderId = candidates[0]!
            passes.push({ hole, playOrderIndex: idx + 1, candidates, holderId, pending: false })
            return
          }
          const tb = snapshot.snakeTiebreaks.find((t) => t.roundId === rid && t.groupId === g.id && t.hole === hole)
          if (tb && candidates.includes(tb.lastHoledPlayerId)) {
            holderId = tb.lastHoledPlayerId
            passes.push({ hole, playOrderIndex: idx + 1, candidates, holderId, pending: false })
          } else {
            pendingHole = hole
            stuck = true
            holderId = null
            passes.push({ hole, playOrderIndex: idx + 1, candidates, holderId: null, pending: true })
            pending.push({ roundId: rid, groupId: g.id, hole, candidates })
          }
        })
        const finished =
          (ctx.roundFinal[rid] ?? false) || g.playerIds.every((pid) => byPlayer[pid]?.complete)
        const n = g.playerIds.length
        const pot = perSurvivor * (n - 1)
        const payouts: SnakeGroupState['payouts'] = {}
        if (finished && pendingHole == null && n > 0) {
          if (holderId) {
            for (const pid of g.playerIds) {
              if (pid === holderId) {
                payouts[pid] = {
                  amount: 0,
                  why: { title: '$0', steps: [`Terminó con la víbora (último 3-putt en el hoyo ${passes.at(-1)?.hole})`] },
                }
              } else {
                payouts[pid] = {
                  amount: perSurvivor,
                  why: { title: `$${perSurvivor}`, steps: [`Sin víbora al final; ${nameOf(holderId)} se la quedó`] },
                }
              }
            }
          } else {
            const each = Math.floor(pot / n)
            let rem = pot - each * n
            for (const pid of g.playerIds) {
              const extra = rem > 0 ? 1 : 0
              rem -= extra
              payouts[pid] = {
                amount: each + extra,
                why: { title: `$${each + extra}`, steps: [`Nadie hizo ${threshold} putts: $${pot} entre ${n}`] },
              }
            }
          }
        }
        groups.push({
          roundId: rid,
          roundNumber: round.number,
          groupId: g.id,
          groupNumber: g.number,
          playerIds: g.playerIds,
          passes,
          holderId,
          pendingHole,
          finished,
          pot,
          payouts,
          final: ctx.roundFinal[rid] ?? false,
        })
      }
    }
    return { groups, pending, holesHeld }
  },
  prizes(state, ctx) {
    const label = ctx.settings.modules.snake.label
    const out: PrizeAward[] = []
    for (const g of state.groups) {
      for (const [playerId, p] of Object.entries(g.payouts)) {
        if (p.amount === 0) continue
        out.push({
          moduleId: 'snake',
          label: `${label} · Día ${g.roundNumber} · Grupo ${g.groupNumber}`,
          playerId,
          amount: p.amount,
          final: g.final,
          why: p.why,
        })
      }
    }
    return out
  },
}

/**
 * Entry point of the engine (CLAUDE.md §6). Pure: no I/O, no React.
 * `computeTournament(snapshot, settings)` runs the core, then every enabled
 * module, then the money, and merges the result.
 */
import { MODULE_IDS, type ModuleId, type TournamentSettings } from './settings/schema'
import type { Id, Snapshot } from './types'
import { computeCore } from './core/compute'
import type { CoreState } from './core/types'
import { computeMoney, type MoneyState } from './core/money'
import { computeStats, type StatsState } from './core/stats'
import { computeFeed, type FeedEvent } from './core/feed'
import { ALL_MODULES, type AnyModule } from './modules'
import type { ModuleContext, PrizeAward } from './modules/module'
import type { AuctionState } from './modules/auction'
import type { BestRoundState } from './modules/bestRound'
import type { FewestPuttsState } from './modules/fewestPutts'
import type { IndividualState } from './modules/individual'
import type { PairsState } from './modules/pairs'
import type { SnakeState } from './modules/snake'

export interface ModuleStates {
  individual?: IndividualState
  bestRound?: BestRoundState
  pairs?: PairsState
  snake?: SnakeState
  fewestPutts?: FewestPuttsState
  auction?: AuctionState
}

export interface StatusFlags {
  /** Rounds that are live with at least one incomplete card. */
  incompleteRounds: Array<{ roundId: Id; players: Id[] }>
  pendingSnakeTiebreaks: SnakeState['pending']
  /** Pair cards complete but not signed (only when the pairs module is on). */
  unsignedCards: Array<{ roundId: Id; pairId: Id }>
  /** Holes overwritten by a different device with different values (§8). */
  discrepancies: Array<{ roundId: Id; playerId: Id; hole: number }>
  /** Enabled modules with no implementation (should never happen in production). */
  missingModules: ModuleId[]
  warnings: string[]
}

export interface TournamentState {
  settings: TournamentSettings
  core: CoreState
  /** Only the enabled modules appear here. */
  modules: ModuleStates
  /** Every prize any enabled module awards, live and final. */
  prizes: PrizeAward[]
  money: MoneyState
  /** Stats and awards (§12), display only. */
  stats: StatsState
  /** Derived feed events, newest first. */
  feed: FeedEvent[]
  flags: StatusFlags
  tournamentFinal: boolean
}

export interface ComputeOptions {
  /** Override the module implementations (tests). */
  modules?: Partial<Record<ModuleId, AnyModule>>
}

export function computeTournament(snapshot: Snapshot, settings: TournamentSettings, opts: ComputeOptions = {}): TournamentState {
  const core = computeCore(snapshot, settings)
  const roundFinal: Record<Id, boolean> = {}
  for (const r of snapshot.rounds) roundFinal[r.id] = r.status === 'finished'
  const tournamentFinal =
    snapshot.tournament.status === 'finished' ||
    (core.roundIds.length > 0 && core.roundIds.every((rid) => roundFinal[rid]))
  const ctx: ModuleContext = { snapshot, settings, core, tournamentFinal, roundFinal }
  const impls = { ...ALL_MODULES, ...opts.modules }

  const modules: ModuleStates = {}
  const prizes: PrizeAward[] = []
  const missingModules: ModuleId[] = []
  for (const id of MODULE_IDS) {
    if (!settings.modules[id].enabled) continue
    const mod = impls[id]
    if (!mod) {
      missingModules.push(id)
      continue
    }
    const state = mod.compute(ctx)
    ;(modules as Record<string, unknown>)[id] = state
    prizes.push(...mod.prizes(state, ctx))
  }

  const money = computeMoney(snapshot, settings, prizes, modules.auction, tournamentFinal)
  const stats = computeStats(snapshot, core, { snake: modules.snake, auction: modules.auction })
  const feed = computeFeed(snapshot, core, modules.snake)

  const incompleteRounds: StatusFlags['incompleteRounds'] = []
  for (const rid of core.roundIds) {
    const round = snapshot.rounds.find((r) => r.id === rid)!
    if (round.status !== 'live') continue
    const players = Object.values(core.rounds[rid] ?? {})
      .filter((pr) => !pr.complete)
      .map((pr) => pr.playerId)
    if (players.length) incompleteRounds.push({ roundId: rid, players })
  }
  const unsignedCards: StatusFlags['unsignedCards'] = []
  if (modules.pairs) {
    for (const rid of core.roundIds) {
      for (const pair of snapshot.pairs) {
        const a = core.rounds[rid]?.[pair.player1Id]
        const b = core.rounds[rid]?.[pair.player2Id]
        if (!a?.complete || !b?.complete) continue
        const signed = snapshot.cardSignatures.some((s) => s.roundId === rid && s.pairId === pair.id)
        if (!signed) unsignedCards.push({ roundId: rid, pairId: pair.id })
      }
    }
  }

  const discrepancies = snapshot.scores.filter((s) => s.disputed).map((s) => ({ roundId: s.roundId, playerId: s.playerId, hole: s.hole }))

  const auctionWarnings: string[] = []
  if (modules.auction) {
    const unfilled = modules.auction.slots.filter((s) => s.unfilled)
    if (unfilled.length) auctionWarnings.push(`${settings.modules.auction.label}: $${modules.auction.unfilled} sin asignar (${unfilled.map((s) => s.label).join(', ')}). El Comité decide.`)
    const unsold = modules.auction.lots.filter((l) => l.status !== 'sold')
    if (tournamentFinal && unsold.length && modules.auction.soldCount > 0) auctionWarnings.push(`${settings.modules.auction.label}: ${unsold.length} lote${unsold.length === 1 ? '' : 's'} sin vender.`)
  }

  return {
    settings,
    core,
    modules,
    prizes,
    money,
    stats,
    feed,
    flags: {
      incompleteRounds,
      pendingSnakeTiebreaks: modules.snake?.pending ?? [],
      unsignedCards,
      discrepancies,
      missingModules,
      warnings: [...core.warnings, ...(modules.pairs?.groupWarnings.map((w) => w.message) ?? []), ...auctionWarnings],
    },
    tournamentFinal,
  }
}

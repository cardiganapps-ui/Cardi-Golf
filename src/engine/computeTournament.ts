/**
 * Entry point of the engine (CLAUDE.md §6). Pure: no I/O, no React.
 * `computeTournament(snapshot, settings)` runs the core, then every enabled
 * module, then the money, and merges the result.
 */
import { MODULE_IDS, type ModuleId, type TournamentSettings } from './settings/schema'
import type { Id, Snapshot } from './types'
import { t } from '../i18n/es-MX'
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
import { ALL_GAMES, type AnyGame } from './games'
import type { GameContext, GameResultState } from './games/game'
import { gamePot } from './games/payout'
import type { GameType } from './settings/games'
import { bracketState, type BracketState } from './formats/bracket'
import { mainScoring, ranksPlayersByTotal } from './formats'
import { checkPrizePool, fieldShape, type PrizeCheck } from './settings/prizeCheck'

/** "$27,500": the engine stays locale-free. */
const peso = (n: number) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

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
  /** Enabled instance games whose type this build does not implement (an older app). */
  missingGames: string[]
  warnings: string[]
  /** The main pot against the real field and rounds (MONEY-06); `balanced` false means prizes and entries drifted apart. */
  pool: PrizeCheck
  /** The warning for an unbalanced pool once past setup (also in `warnings`), for the money screens. */
  poolWarning: string | null
}

export interface TournamentState {
  settings: TournamentSettings
  core: CoreState
  /** Only the enabled modules appear here. */
  modules: ModuleStates
  /** The knockout bracket, under match play only; null for every other format. */
  bracket: BracketState | null
  /** Enabled instance games (`settings.games`), by game id. */
  games: Record<string, GameResultState>
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
  /** Override the instance-game implementations (tests). */
  games?: Partial<Record<GameType, AnyGame>>
}

export function computeTournament(snapshot: Snapshot, settings: TournamentSettings, opts: ComputeOptions = {}): TournamentState {
  const core = computeCore(snapshot, settings)
  const roundFinal: Record<Id, boolean> = {}
  for (const r of snapshot.rounds) roundFinal[r.id] = r.status === 'finished'
  // Final when the Comité says so, or when every planned round exists and is
  // finished: finishing day 1 of a two-day event whose day 2 is not created
  // yet must not finalize it (MONEY-06).
  const tournamentFinal =
    snapshot.tournament.status === 'finished' ||
    (core.roundIds.length > 0 && core.roundIds.length >= settings.rounds && core.roundIds.every((rid) => roundFinal[rid]))
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

  // Instance games (skins, matches, contests, custom bets...).
  const games: Record<string, GameResultState> = {}
  const missingGames: string[] = []
  const gameWarnings: string[] = []
  const gameImpls = { ...ALL_GAMES, ...opts.games }
  const roster = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.id)
  const roundNumber = new Map(snapshot.rounds.map((r) => [r.id, r.number]))
  for (const config of settings.games) {
    if (!config.enabled) continue
    const impl = gameImpls[config.type]
    if (!impl) {
      missingGames.push(config.id)
      gameWarnings.push(`${config.label}: esta versión de la app no conoce este juego. Actualiza la app.`)
      continue
    }
    const listed = new Set(snapshot.gameEntries.filter((e) => e.gameId === config.id).map((e) => e.playerId))
    const entrants = config.entrants === 'all' ? roster : roster.filter((id) => listed.has(id))
    const roundIds = config.rounds === 'all' ? core.roundIds : core.roundIds.filter((rid) => (config.rounds as number[]).includes(roundNumber.get(rid) ?? 0))
    const final = tournamentFinal || (roundIds.length > 0 && roundIds.every((rid) => roundFinal[rid]))
    const pot = gamePot(config, entrants.length)
    const gctx: GameContext = { ...ctx, config, entrants, roundIds, pot, final }
    const state = impl.compute(gctx)
    const board = impl.board(state, gctx)
    games[config.id] = { config, entrants, pot, final, state, board }
    prizes.push(...impl.prizes(state, gctx))
    if (impl.warnings) gameWarnings.push(...impl.warnings(state, gctx))
  }

  const money = computeMoney(snapshot, settings, prizes, modules.auction, tournamentFinal, games)
  const stats = computeStats(snapshot, core, { snake: modules.snake, auction: modules.auction }, mainScoring(settings))
  const feed = computeFeed(snapshot, core, modules.snake, { scoring: mainScoring(settings), leaders: ranksPlayersByTotal(settings) })
  // At the close the board can name a leader the saved scores never did: an
  // incomplete card ranks after the complete ones (MONEY-02), a countback
  // breaks a tie. The feed's last word is then the board's, not the replay's.
  if (tournamentFinal && ranksPlayersByTotal(settings) && modules.individual) {
    const top = modules.individual.rows.filter((r) => r.position === 1)
    const lastLead = feed.find((e) => e.kind === 'leadChange')
    if (top.length === 1 && lastLead && lastLead.playerId !== top[0]!.playerId) {
      const last = snapshot.rounds.filter((r) => core.roundIds.includes(r.id)).at(-1)
      feed.unshift({ kind: 'leadChange', at: feed[0]?.at ?? null, roundNumber: last?.number ?? 1, hole: last?.holes ?? 18, playerId: top[0]!.playerId, figure: top[0]!.figure.text, scoring: mainScoring(settings) })
    }
  }

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
    if (unfilled.length) auctionWarnings.push(`${settings.modules.auction.label}: $${modules.auction.unfilled} sin asignar (${t.common.andList(unfilled.map((s) => s.label))}). El Comité decide.`)
    const unsold = modules.auction.lots.filter((l) => l.status !== 'sold')
    if (tournamentFinal && unsold.length && modules.auction.soldCount > 0) auctionWarnings.push(`${settings.modules.auction.label}: ${unsold.length} lote${unsold.length === 1 ? '' : 's'} sin vender.`)
  }

  // The money plan against the real tournament (MONEY-06): settings are
  // checked when saved, but a player who never shows or a round added later
  // moves the pool. Past setup, an imbalance is a warning everyone sees.
  const pool = checkPrizePool(settings, fieldShape(snapshot, settings))
  const poolWarnings: string[] = []
  const pastSetup = snapshot.tournament.status !== 'setup' || snapshot.rounds.some((r) => r.status === 'live' || r.status === 'finished')
  if (pastSetup && snapshot.players.length > 0 && !pool.balanced) {
    poolWarnings.push(
      pool.difference < 0
        ? `Los premios suman ${peso(pool.prizesTotal)} y las inscripciones ${peso(pool.entryPot)}: faltan ${peso(-pool.difference)}. El Comité ajusta los premios en Comité, sección Torneo.`
        : `Las inscripciones suman ${peso(pool.entryPot)} y los premios ${peso(pool.prizesTotal)}: sobran ${peso(pool.difference)} sin premio. El Comité ajusta los premios en Comité, sección Torneo.`,
    )
  }

  // The bracket is only meaningful under match play, and costs nothing to
  // skip: every other format leaves it null.
  const bracket = settings.modules.individual.enabled && settings.modules.individual.format === 'matchPlay' ? bracketState(ctx) : null

  return {
    settings,
    core,
    modules,
    bracket,
    games,
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
      missingGames,
      warnings: [...poolWarnings, ...core.warnings, ...(modules.individual?.warnings ?? []), ...(modules.pairs?.groupWarnings.map((w) => w.message) ?? []), ...auctionWarnings, ...gameWarnings],
      pool,
      poolWarning: poolWarnings[0] ?? null,
    },
    tournamentFinal,
  }
}

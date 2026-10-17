/**
 * Entry point of the engine (CLAUDE.md §6). Pure: no I/O, no React.
 * `computeTournament(snapshot, settings)` runs the core, then every enabled
 * module, then the money, and merges the result.
 */
import { MODULE_IDS, type ModuleId, type TournamentSettings } from './settings/schema'
import { unknownGamesOf } from './settings/read'
import type { Id, Snapshot } from './types'
import { msg, type Msg } from './messages'
import { computeCore } from './core/compute'
import type { CoreState } from './core/types'
import { computeMoney, type MoneyState } from './core/money'
import { applyAdjustments, bucketLabel, heldMoney, openDays, unassignedBuckets } from './core/unassigned'
import { computeStats, type StatsState } from './core/stats'
import { computeFeed, type FeedEvent } from './core/feed'
import { ALL_MODULES, type ModuleRegistry, type ModuleStates } from './modules'
import type { SnakeState } from './modules/snake'
import { ALL_GAMES } from './games'
import type { Game, GameConfigFor, GameContext, GameImpl, GameResultFor, GameResultState, ModuleContext, PrizeAward } from './games/game'
import { gamePot } from './games/payout'
import { isFinal } from './core/ranking'
import type { GameConfig, GameType } from './settings/games'
import { bracketState, type BracketState } from './formats/bracket'
import { mainScoring, ranksPlayersByTotal } from './formats'
import { checkPrizePool, fieldShape, type PrizeCheck } from './settings/prizeCheck'
import { handicapChanges, type HandicapChange } from './core/handicapLock'
import { missingPutts, puttingGames, type MissingPutts } from './core/putts'
import { cardSignedFor, cardSigningMode } from './core/cardSigning'

export type { ModuleStates }

/** A card waiting for its signature: a pair's (tarjeta cruzada) or one player's (a marker's). */
export type UnsignedCard = { roundId: Id; pairId: Id } | { roundId: Id; playerId: Id }

export interface StatusFlags {
  /** Rounds that are live with at least one incomplete card. */
  incompleteRounds: Array<{ roundId: Id; players: Id[] }>
  pendingSnakeTiebreaks: SnakeState['pending']
  /**
   * Cards complete but not signed, by the tournament's signing rule (UX-23): a pair's under `pairs` (only with the
   * pairs game on), a player's under `marker`, none under `none`.
   */
  unsignedCards: UnsignedCard[]
  /** Holes overwritten by a different device with different values (§8). */
  discrepancies: Array<{ roundId: Id; playerId: Id; hole: number }>
  /** Holes played without putts while a game pays on putts (MONEY-18): the Comité captures them, and the close waits. */
  missingPutts: MissingPutts[]
  /** Enabled modules with no implementation (should never happen in production). */
  missingModules: ModuleId[]
  /** Enabled instance games whose type this build does not implement (an older app). */
  missingGames: string[]
  /**
   * The labels of those games that may move money (ARCH-04): this build can't count the
   * tournament's money, so no screen shows any (`useShowMoney`) and En vivo says why.
   */
  moneyUnknown: string[]
  warnings: Msg[]
  /** The main pot against the real field and rounds (MONEY-06); `balanced` false means prizes and entries drifted apart. */
  pool: PrizeCheck
  /** The warning for an unbalanced pool once past setup (also in `warnings`), for the money screens. */
  poolWarning: Msg | null
  /** Players whose handicap changed after they were fixed (UX-28): En vivo and their sheet say so. */
  handicapChanges: HandicapChange[]
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
  modules?: Partial<ModuleRegistry>
  /**
   * Stand in for instance-game types (tests): a stand-in knows no type's
   * config and its state is its test's own, so it is typed as neither.
   */
  games?: Partial<Record<GameType, GameImpl>>
}

/** What running one game gives: its state, its prizes and its warnings. */
interface GameRun<S> {
  state: S
  prizes: PrizeAward[]
  warnings: Msg[]
}

/** The one runner both kinds of game go through (ARCH-15). */
function run<S, Ctx extends ModuleContext>(game: Game<S, Ctx>, ctx: Ctx): GameRun<S> {
  const state = game.compute(ctx)
  return { state, prizes: game.prizes(state, ctx), warnings: game.warnings?.(state, ctx) ?? [] }
}

export function computeTournament(snapshot: Snapshot, settings: TournamentSettings, opts: ComputeOptions = {}): TournamentState {
  const core = computeCore(snapshot, settings)
  const roundFinal: Record<Id, boolean> = {}
  for (const r of snapshot.rounds) roundFinal[r.id] = r.status === 'finished'
  // Play is over when every planned day exists and is finished or cancelled:
  // finishing day 1 of a two-day event whose day 2 is not created yet is not
  // (MONEY-06). Whatever the tournament's status, so Dinero and the «Cerrar
  // torneo» gate (which reads the tournament as Terminado) compute the same
  // prizes and the same «por asignar» (round 2 of PR 104: every day rained out,
  // a day not created yet).
  const playOver = snapshot.rounds.length > 0 && snapshot.rounds.length >= settings.rounds && snapshot.rounds.every((r) => r.status === 'finished' || r.status === 'cancelled')
  // Final when the Comité says so, or once play is over: a cancelled day's
  // prizes are «por asignar» from then on, and the rest is what Terminado pays.
  const tournamentFinal = snapshot.tournament.status === 'finished' || playOver
  const ctx: ModuleContext = { snapshot, settings, core, tournamentFinal, roundFinal }
  const impls: Partial<ModuleRegistry> = { ...ALL_MODULES, ...opts.modules }

  const modules: ModuleStates = {}
  const prizes: PrizeAward[] = []
  const missingModules: ModuleId[] = []
  /** Each enabled module's warnings, by id: the pairs' group composition is kept apart, see the flags. */
  const moduleWarnings: Partial<Record<ModuleId, Msg[]>> = {}
  const runModule = <K extends ModuleId>(id: K, mod: ModuleRegistry[K]) => {
    const r = run(mod, ctx)
    modules[id] = r.state
    prizes.push(...r.prizes)
    moduleWarnings[id] = r.warnings
  }
  for (const id of MODULE_IDS) {
    if (!settings.modules[id].enabled) continue
    const mod = impls[id]
    if (mod) runModule(id, mod)
    else missingModules.push(id)
  }

  // Instance games (skins, matches, contests, custom bets...).
  const games: Record<string, GameResultState> = {}
  const missingGames: string[] = []
  const gameWarnings: Msg[] = []
  const roster = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.id)
  const roundNumber = new Map(snapshot.rounds.map((r) => [r.id, r.number]))
  const outdated = (g: { id: string; label: string }) => {
    missingGames.push(g.id)
    gameWarnings.push(msg('outdated.game', { label: g.label }))
  }
  const gameContext = <C extends GameConfig>(config: C): GameContext<C> => {
    const listed = new Set(snapshot.gameEntries.filter((e) => e.gameId === config.id).map((e) => e.playerId))
    const entrants = config.entrants === 'all' ? roster : roster.filter((id) => listed.has(id))
    const rounds = config.rounds
    const roundIds = rounds === 'all' ? core.roundIds : core.roundIds.filter((rid) => rounds.includes(roundNumber.get(rid) ?? 0))
    return { ...ctx, config, entrants, roundIds, pot: gamePot(config, entrants.length), final: isFinal(ctx, 'roundsOrTournament', roundIds) }
  }
  const runGame = <S, C extends GameConfig>(impl: GameImpl<S, C>, config: C) => {
    const gctx = gameContext(config)
    const r = run(impl, gctx)
    prizes.push(...r.prizes)
    gameWarnings.push(...r.warnings)
    return { config, entrants: gctx.entrants, pot: gctx.pot, final: gctx.final, state: r.state, board: impl.board(r.state, gctx) }
  }
  // Each config through its own type's implementation, typed together (GameConfigFor), so the result is that type's.
  const runShipped = <K extends GameType>(config: GameConfigFor<K>): GameResultFor<K> => runGame(ALL_GAMES[config.type], config)
  for (const config of settings.games) {
    if (!config.enabled) continue
    if (opts.games && config.type in opts.games) {
      const standIn = opts.games[config.type]
      // A stand-in's state is its test's own: the record's types speak for the shipped games.
      if (standIn) games[config.id] = runGame(standIn, config) as GameResultState
      else outdated(config)
      continue
    }
    games[config.id] = runShipped(config)
  }
  // A newer build's game type: the row keeps it (`readSettings` set it aside), this build can't compute it (ARCH-04).
  const unknownGames = unknownGamesOf(snapshot.tournament.settings).filter((g) => g.enabled)
  for (const g of unknownGames) outdated(g)
  const moneyUnknown = unknownGames.filter((g) => g.money).map((g) => g.label)

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
      feed.unshift({ kind: 'leadChange', at: feed[0]?.at ?? null, roundNumber: last?.number ?? 1, hole: last?.holes ?? 18, playerId: top[0]!.playerId, figure: top[0]!.figure.text, scoring: mainScoring(settings), close: true, previous: lastLead.playerId })
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
  // Holes played without putts while a game pays on them (MONEY-18): named for the Comité, and the close waits for them.
  const noPutts = missingPutts(core, settings)
  const puttsWarnings: Msg[] = []
  if (noPutts.length) {
    const days = new Map<Id, Array<{ day: number; holes: number[] }>>()
    for (const m of noPutts) days.set(m.playerId, [...(days.get(m.playerId) ?? []), { day: m.roundNumber, holes: m.holes }])
    const nameOf = (id: Id) => snapshot.players.find((p) => p.id === id)?.displayName ?? id
    puttsWarnings.push(msg('putts.missing', { who: [...days].map(([id, d]) => ({ name: nameOf(id), days: d })), games: puttingGames(settings) }))
  }
  const unsignedCards: StatusFlags['unsignedCards'] = []
  const signing = cardSigningMode(settings)
  if (signing === 'pairs' && modules.pairs) {
    for (const rid of core.roundIds) {
      for (const pair of snapshot.pairs) {
        const a = core.rounds[rid]?.[pair.player1Id]
        const b = core.rounds[rid]?.[pair.player2Id]
        if (!a?.complete || !b?.complete) continue
        const signed = snapshot.cardSignatures.some((s) => s.roundId === rid && s.pairId === pair.id)
        if (!signed) unsignedCards.push({ roundId: rid, pairId: pair.id })
      }
    }
  } else if (signing === 'marker') {
    // A marker signs each player's card: every card complete that day and not signed (his own or, from before, his pair's).
    for (const rid of core.roundIds) {
      for (const pr of Object.values(core.rounds[rid] ?? {})) {
        if (pr.complete && !cardSignedFor(snapshot, rid, pr.playerId)) unsignedCards.push({ roundId: rid, playerId: pr.playerId })
      }
    }
  }

  // The games' warnings in module order; a group that is not one pair of each kind (§18.5) is the field's, not the
  // pairs' money, so it comes before them and never reaches «por asignar».
  const moduleFlagWarnings = MODULE_IDS.flatMap((id) => [...(id === 'pairs' ? (modules.pairs?.groupWarnings.map((w) => w.message) ?? []) : []), ...(moduleWarnings[id] ?? [])])

  const discrepancies = snapshot.scores.filter((s) => s.disputed).map((s) => ({ roundId: s.roundId, playerId: s.playerId, hole: s.hole }))

  // The money plan against the real tournament (MONEY-06): settings are
  // checked when saved, but a player who never shows or a round added later
  // moves the pool. Past setup, an imbalance is a warning everyone sees.
  const pool = checkPrizePool(settings, fieldShape(snapshot, settings))
  const poolWarnings: Msg[] = []
  const pastSetup = snapshot.tournament.status !== 'setup' || snapshot.rounds.some((r) => r.status === 'live' || r.status === 'finished')
  if (pastSetup && snapshot.players.length > 0 && !pool.balanced) {
    poolWarnings.push(
      pool.difference < 0
        ? msg('pool.short', { prizes: pool.prizesTotal, entries: pool.entryPot, missing: -pool.difference })
        : msg('pool.surplus', { entries: pool.entryPot, prizes: pool.prizesTotal, left: pool.difference }),
    )
  }
  // A place the field can no longer fill (MONEY-09). Once final, each game
  // says which places went unfilled, those included, so this one stops.
  if (pastSetup && !tournamentFinal) {
    for (const u of pool.unreachable) poolWarnings.push(msg('pool.unreachable', { label: u.label, detail: u.detail, amount: u.amount }))
  }

  // «Por asignar» (MONEY-05): once play is over, what the rules leave with
  // the bank, by pot, and the Comité's assignments of it. What they give a
  // player is a prize like any other, so every money screen reads it.
  // Listed once play is over (`playOver`, above), whatever the status: Dinero
  // and the «Cerrar torneo» gate read this same flag, so the gate never blocks
  // on a list Dinero does not show.
  const closing = playOver
  // The Comité's decisions are checked and paid whenever the modules pay as
  // final, so Terminado with a day still open or never created (an older
  // bundle, a direct update, a restored backup) pays the same decisions it
  // paid when that day was cancelled: what was handed over is never asked
  // back. Nothing is listed then (`closing` stays false): Dinero names the day
  // to finish or cancel instead (round 3 of PR 104, N1).
  const settled = tournamentFinal
  const buckets = unassignedBuckets({
    snapshot,
    settings,
    prizes,
    pool,
    auction: modules.auction,
    snake: modules.snake,
    games,
    warnings: [...MODULE_IDS.flatMap((id) => moduleWarnings[id] ?? []), ...gameWarnings],
    closing: settled,
  })
  const applied = applyAdjustments(buckets, snapshot.moneyAdjustments ?? [], settled, (key) => bucketLabel(key, settings), heldMoney({ settings, snake: modules.snake, closing: settled }))
  const unassigned = closing || !settled ? applied : { ...applied, closing: false, openDays: openDays(snapshot.rounds, settings.rounds), buckets: [], total: 0, held: [], heldTotal: 0 }
  prizes.push(...unassigned.awards)
  const money = computeMoney(snapshot, settings, prizes, modules.auction, tournamentFinal, games, unassigned.toHouse)
  money.unassigned = unassigned
  // What is left in the bank and what the list says must be the same pesos.
  const unassignedWarnings = [...unassigned.warnings]
  const listed = unassigned.total + unassigned.heldTotal
  if (closing && money.banker.difference > 0 && money.banker.difference !== listed) unassignedWarnings.push(msg('unassigned.mismatch', { bank: money.banker.difference, listed }))

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
      missingPutts: noPutts,
      missingModules,
      missingGames,
      moneyUnknown,
      warnings: [...poolWarnings, ...core.warnings, ...puttsWarnings, ...moduleFlagWarnings, ...gameWarnings, ...unassignedWarnings],
      pool,
      poolWarning: poolWarnings[0] ?? null,
      handicapChanges: handicapChanges(snapshot, settings),
    },
    tournamentFinal,
  }
}

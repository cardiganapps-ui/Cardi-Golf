/**
 * Instance games (`settings.games`): side games a tournament can add as many
 * times as it likes (skins on day 1 net and day 2 gross, three Nassau
 * matches...). The six original games stay singletons in `settings.modules`.
 *
 * Every game carries its own money: where its pot comes from and how it pays.
 * - `none`   just for fun, no money.
 * - `main`   a fixed `amount` taken from the main entry pot.
 * - `side`   a side pot: each entrant pays `buyIn`; the pot pays only entrants.
 * - `direct` bets between players: the loser pays the winner `stake` per unit.
 */
import { z } from 'zod'

const money = z.number().int().nonnegative()
const label = z.string().trim().min(1).max(40)

export const GAME_TYPES = ['skins', 'lowScore', 'eventPot', 'match', 'contest', 'custom'] as const
export type GameType = (typeof GAME_TYPES)[number]

export const GameMoney = z.object({
  source: z.enum(['none', 'main', 'side', 'direct']),
  /** `side`: what each entrant pays into the pot. */
  buyIn: money.default(0),
  /** `main`: pesos this game takes from the main pot. */
  amount: money.default(0),
  /** `direct`: what the loser pays per unit (skin, event, segment, win). */
  stake: money.default(0),
  /** Games paid by places: percent of the pot per place, [1st, 2nd, ...]; must add up to 100. */
  split: z.array(z.number().min(0).max(100)).default([100]),
})
export type GameMoney = z.infer<typeof GameMoney>

const basis = z.enum(['net', 'gross'])

const gameBase = {
  /** Short stable id, unique within the tournament (used by entrants and captures). */
  id: z.string().trim().regex(/^[a-z0-9-]{1,32}$/),
  label,
  enabled: z.boolean().default(true),
  /** Round numbers this game covers, or all of them. */
  rounds: z.union([z.literal('all'), z.array(z.number().int().min(1)).min(1)]).default('all'),
  /** Everyone plays, or only the players listed in `game_entries`. */
  entrants: z.enum(['all', 'list']).default('all'),
  money: GameMoney,
}

export const SkinsGame = z.object({
  ...gameBase,
  type: z.literal('skins'),
  options: z.object({
    basis: basis.default('net'),
    /** A tied hole carries its skin to the next one. */
    carryOver: z.boolean().default(true),
  }),
})

export const LowScoreGame = z.object({
  ...gameBase,
  type: z.literal('lowScore'),
  options: z.object({
    /** Low gross, low net, or most Stableford points. */
    basis: z.enum(['net', 'gross', 'points']).default('net'),
    /** One prize over all its rounds, or one per round. */
    scope: z.enum(['overall', 'perRound']).default('overall'),
  }),
})

export const EventPotGame = z.object({
  ...gameBase,
  type: z.literal('eventPot'),
  options: z.object({
    /** Birdie or better / eagle or better pay the player; a three-putt costs him. */
    event: z.enum(['birdie', 'eagle', 'threePutt']),
    basis: basis.default('gross'),
  }),
})

export const MatchSide = z.array(z.string().min(1)).min(1).max(2)
export const Match = z.object({
  id: z.string().min(1),
  a: MatchSide,
  b: MatchSide,
})
export type Match = z.infer<typeof Match>

export const MatchGame = z.object({
  ...gameBase,
  type: z.literal('match'),
  options: z.object({
    /** Nassau pays front 9, back 9 and the 18; `match` pays the 18 only. */
    format: z.enum(['nassau', 'match']).default('nassau'),
    basis: basis.default('net'),
    /** Two-player sides: best ball of the pair, or the pair's combined score. */
    pairScoring: z.enum(['bestBall', 'aggregate']).default('bestBall'),
    /** Automatic press when a side is this many holes down in a segment; 0 = no presses. */
    pressAt: z.number().int().min(0).max(5).default(0),
    maxPresses: z.number().int().min(0).max(5).default(1),
    matches: z.array(Match).default([]),
  }),
})

export const ContestGame = z.object({
  ...gameBase,
  type: z.literal('contest'),
  options: z.object({
    kind: z.enum(['closest', 'longDrive', 'greenie', 'sandy', 'custom']),
    /** Every par 3, chosen hole numbers, or every hole. */
    holes: z.union([z.enum(['par3', 'all']), z.array(z.number().int().min(1).max(18)).min(1)]).default('par3'),
  }),
})

export const CustomGame = z.object({
  ...gameBase,
  type: z.literal('custom'),
  options: z.object({
    description: z.string().trim().max(280).default(''),
  }),
})

export const GameConfig = z.discriminatedUnion('type', [SkinsGame, LowScoreGame, EventPotGame, MatchGame, ContestGame, CustomGame])
export type GameConfig = z.infer<typeof GameConfig>
export type GameOf<T extends GameType> = Extract<GameConfig, { type: T }>

/** Which money sources each game type supports. */
export const GAME_SOURCES: Record<GameType, ReadonlyArray<GameMoney['source']>> = {
  skins: ['none', 'main', 'side', 'direct'],
  lowScore: ['none', 'main', 'side'],
  eventPot: ['none', 'main', 'side', 'direct'],
  match: ['none', 'direct'],
  contest: ['none', 'main', 'side', 'direct'],
  custom: ['none', 'main', 'side', 'direct'],
}

/** Games that pay by places use `money.split`; the rest pay per unit won. */
export const PAYS_BY_PLACE: Record<GameType, boolean> = {
  skins: false,
  lowScore: true,
  eventPot: false,
  match: false,
  contest: false,
  custom: false,
}

export function gameIssues(g: GameConfig): Array<{ path: (string | number)[]; message: string }> {
  const out: Array<{ path: (string | number)[]; message: string }> = []
  if (!GAME_SOURCES[g.type].includes(g.money.source)) {
    out.push({ path: ['money', 'source'], message: `${g.label}: este juego no se paga así.` })
  }
  if (g.type === 'eventPot' && g.options.event === 'threePutt' && (g.money.source === 'main' || g.money.source === 'side')) {
    out.push({ path: ['money', 'source'], message: `${g.label}: los tres putts se cobran directo entre jugadores.` })
  }
  if (PAYS_BY_PLACE[g.type] && (g.money.source === 'main' || g.money.source === 'side')) {
    const sum = g.money.split.reduce((s, x) => s + x, 0)
    if (Math.abs(sum - 100) > 1e-9) out.push({ path: ['money', 'split'], message: `${g.label}: el reparto suma ${sum}%, debe sumar 100%.` })
  }
  if (g.type === 'match') {
    g.options.matches.forEach((m, i) => {
      if (m.a.length !== m.b.length) out.push({ path: ['options', 'matches', i], message: `${g.label}: los dos lados de un partido llevan los mismos jugadores.` })
      if (m.a.some((p) => m.b.includes(p))) out.push({ path: ['options', 'matches', i], message: `${g.label}: un jugador no puede estar en los dos lados.` })
    })
  }
  return out
}

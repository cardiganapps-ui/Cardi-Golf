/**
 * Tournament settings: every rule in CLAUDE.md §5 is a value here (§0.5, §18).
 *
 * The shape ships with `modules` all off except `individual`; the create
 * wizard fills the rest. `FIRST_TOURNAMENT_SETTINGS` (./presets.ts) holds the
 * values of the first tournament (Nacho's Bachelor Invitational).
 *
 * Code identifiers are generic (`pairs`, `snake`, `lastPlace`); the Spanish
 * names ("Los Matrimonios", "La Víbora", "La Cuchara de Palo") are labels the
 * organizer can rename per tournament.
 */
import { z } from 'zod'
import { GameConfig, gameIssues } from './games'

const money = z.number().int().nonnegative()
const label = z.string().trim().min(1).max(40)

const moduleBase = {
  enabled: z.boolean(),
  label,
}

export const IndividualModuleSettings = z.object({
  ...moduleBase,
  /** Only Stableford in v1; the seam is here for stroke play / match play later. */
  format: z.enum(['stableford']).default('stableford'),
})

export const BestRoundModuleSettings = z.object({ ...moduleBase })

export const PairsModuleSettings = z.object({
  ...moduleBase,
  /** Which tiers pair with which, e.g. [["A","D"],["B","C"]]. Each tier appears at most once. */
  pairing: z
    .array(z.tuple([z.string().trim().min(1), z.string().trim().min(1)]))
    .refine(
      (rules) => {
        const seen = new Set<string>()
        for (const [a, b] of rules) {
          if (a === b || seen.has(a) || seen.has(b)) return false
          seen.add(a)
          seen.add(b)
        }
        return true
      },
      { message: 'Each tier can appear in at most one pairing rule.' },
    ),
  /** The honoree picks his partner instead of being drawn. */
  honoreePicks: z.boolean(),
})

export const SnakeModuleSettings = z.object({
  ...moduleBase,
  /** Putts on one hole that take the snake (3 = a three-putt). */
  puttsThreshold: z.number().int().min(2).max(10),
})

export const FewestPuttsModuleSettings = z.object({ ...moduleBase })

export const AuctionModuleSettings = z.object({ ...moduleBase })

export const ModulesSettings = z.object({
  individual: IndividualModuleSettings,
  bestRound: BestRoundModuleSettings,
  pairs: PairsModuleSettings,
  snake: SnakeModuleSettings,
  fewestPutts: FewestPuttsModuleSettings,
  auction: AuctionModuleSettings,
})

export const MODULE_IDS = ['individual', 'bestRound', 'pairs', 'snake', 'fewestPutts', 'auction'] as const
export type ModuleId = (typeof MODULE_IDS)[number]

export const HandicapSettings = z.object({
  /** Fraction of the base handicap that becomes the playing handicap (0.8 = 80%). */
  allowance: z.number().min(0).max(1),
  /** Base handicaps above this are capped before the allowance is applied. */
  cap: z.number().min(0).max(54),
  rounding: z.enum(['halfUp', 'halfDown', 'nearestEven', 'floor', 'ceil']),
  /**
   * Adjust the playing handicap per round by the round's tee slope
   * (base × slope / 113) before the allowance. Off by default: the first
   * tournament plays two courses with one base handicap (§5.2).
   */
  perRoundSlope: z.boolean().default(false),
  /** Weights for the three-score estimate: [good day, normal day, bad day] (§13b-E). */
  estimateWeights: z
    .tuple([z.number().min(0), z.number().min(0), z.number().min(0)])
    .refine((w) => Math.abs(w[0] + w[1] + w[2] - 1) < 1e-9, { message: 'Estimate weights must add up to 1.' })
    .default([0.45, 0.4, 0.15]),
})

/** Anti-sandbag rule: strokes cut from the next round's handicap after a big Day 1. */
export const NextRoundCutSettings = z.object({
  /** Points above which the cut starts (36 = net par). */
  threshold: z.number().int().min(0),
  /** One stroke per this many points over the threshold. */
  pointsPerStroke: z.number().int().min(1),
  /** Never cut more than this. */
  maxStrokes: z.number().int().min(0),
  /**
   * Rounds 3+ (the rules sheet only defines Day 2): `previous` computes each
   * round's cut from the previous round alone; `cumulative` adds the cuts up.
   */
  mode: z.enum(['previous', 'cumulative']).default('previous'),
})

export const PrizeSettings = z.object({
  /**
   * Individual prizes by finishing position: [1st, 2nd, 3rd, ...]. In pesos,
   * or (`stablefordMode: 'percent'`) as percentages of what the main pot has
   * left after every other prize and the house cut.
   */
  stableford: z.array(money),
  stablefordMode: z.enum(['amount', 'percent']).default('amount'),
  /** Pair prizes by finishing position: [1st pair, 2nd pair, ...]. Each pair splits it. */
  pairs: z.array(money),
  /** Paid per round to the best single-round total. */
  bestRoundPerDay: money,
  /** Paid per round to each player in a group who is NOT holding the snake at the end. */
  snakePerSurvivor: money,
  fewestPutts: money,
})

export const AuctionPayoutSlot = z.discriminatedUnion('slot', [
  z.object({ slot: z.literal('place'), place: z.number().int().min(1), share: z.number().min(0).max(1) }),
  z.object({ slot: z.literal('bestOfTier'), tier: z.string().trim().min(1), share: z.number().min(0).max(1) }),
  z.object({ slot: z.literal('lastPlace'), share: z.number().min(0).max(1) }),
])
export type AuctionPayoutSlot = z.infer<typeof AuctionPayoutSlot>

export const AuctionSettings = z.object({
  openingBid: money.min(1),
  increment: money.min(1),
  maxPlayersPerOwner: z.number().int().min(1),
  selfOwnedCountsTowardMax: z.boolean(),
  guestsCanBid: z.boolean(),
  /** Max share (0–100) a player can buy back of himself right after the hammer. */
  buybackMaxPct: z.number().int().min(0).max(100),
  payout: z.array(AuctionPayoutSlot).refine(
    (slots) => Math.abs(slots.reduce((s, x) => s + x.share, 0) - 1) < 1e-9,
    { message: 'Calcutta payout shares must add up to 100%.' },
  ),
})

const TournamentSettingsBase = z.object({
  modules: ModulesSettings,
  /** Ordered best → worst, e.g. ["A","B","C","D"]. Empty = no tiers. */
  tiers: z.array(z.string().trim().min(1)).refine((t) => new Set(t).size === t.length, {
    message: 'Tier names must be unique.',
  }),
  /** Number of rounds (days). Rounds are 1..N. */
  rounds: z.number().int().min(1).max(10),
  /** Players per group; groups are 2–4. Used to plan groups and to check the prize pot. */
  groupSize: z.number().int().min(2).max(4),
  /** Field size the organizer plans for; the prize check uses it until the roster exists. */
  expectedPlayers: z.number().int().min(2).max(200).optional(),
  labels: z.object({
    lastPlace: label,
    honoree: label,
  }),
  /** The main pot: what every player pays to enter. */
  entryFee: money,
  /** Pesos kept out of the main pot for the house (balls, dinner, trophies). */
  houseCut: money.default(0),
  handicap: HandicapSettings,
  /** Applies from round 2 on; irrelevant in a one-round tournament. */
  day2Cut: NextRoundCutSettings,
  prizes: PrizeSettings,
  auction: AuctionSettings,
  /** Side games added as instances (skins, Nassau, contests, custom bets...). */
  games: z.array(GameConfig).default([]),
  /** Putts counted on a picked-up hole for the fewest-putts game. */
  pickupPuttsForFewestPutts: z.number().int().min(0).max(10),
  /** What happens when countback still ties: split the prizes. */
  tieFallback: z.enum(['split']),
  /** Optional read-only public board (no money). */
  spectatorLink: z.boolean(),
  timezone: z.string().min(1),
  currency: z.string().length(3),
})

/** Cross-field rules: every tier named by a payout slot or a pairing rule must exist in `tiers`. */
export const TournamentSettingsSchema = TournamentSettingsBase.superRefine((v, ctx) => {
  const tiers = new Set(v.tiers)
  if (v.modules.auction.enabled) {
    v.auction.payout.forEach((slot, i) => {
      if (slot.slot === 'bestOfTier' && !tiers.has(slot.tier)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['auction', 'payout', i, 'tier'], message: `La categoría "${slot.tier}" del reparto de la Calcutta no existe en las categorías del torneo.` })
      }
    })
  }
  const gameIds = new Set<string>()
  v.games.forEach((g, i) => {
    if (gameIds.has(g.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['games', i, 'id'], message: `Dos juegos usan el mismo id "${g.id}".` })
    gameIds.add(g.id)
    for (const issue of gameIssues(g)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['games', i, ...issue.path], message: issue.message })
  })
  if (v.prizes.stablefordMode === 'percent' && v.modules.individual.enabled) {
    const sum = v.prizes.stableford.reduce((s, x) => s + x, 0)
    if (sum !== 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prizes', 'stableford'], message: `El reparto individual suma ${sum}%, debe sumar 100%.` })
  }
  if (v.modules.pairs.enabled) {
    v.modules.pairs.pairing.forEach((rule, i) => {
      for (const tier of rule) {
        if (!tiers.has(tier)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['modules', 'pairs', 'pairing', i], message: `La categoría "${tier}" de la regla de parejas no existe en las categorías del torneo.` })
      }
    })
  }
})

export type TournamentSettings = z.infer<typeof TournamentSettingsSchema>
export type ModulesSettings = z.infer<typeof ModulesSettings>
export type PrizeSettings = z.infer<typeof PrizeSettings>

/**
 * Parse raw JSON (e.g. `tournaments.settings`) into validated settings.
 * Accepts the first tournament's historical key `prizes.matrimonios` as an
 * alias of `prizes.pairs` so older rows keep loading.
 */
export function parseSettings(raw: unknown): TournamentSettings {
  return TournamentSettingsSchema.parse(normalizeLegacyKeys(raw))
}

export function safeParseSettings(raw: unknown) {
  return TournamentSettingsSchema.safeParse(normalizeLegacyKeys(raw))
}

function normalizeLegacyKeys(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const r = raw as Record<string, unknown>
  const prizes = r.prizes
  if (prizes && typeof prizes === 'object') {
    const p = prizes as Record<string, unknown>
    if (p.pairs === undefined && p.matrimonios !== undefined) {
      const { matrimonios, ...rest } = p
      return { ...r, prizes: { ...rest, pairs: matrimonios } }
    }
  }
  return raw
}

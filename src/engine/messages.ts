/**
 * What the engine says, as codes (ARCH-05). The engine computes; it never
 * writes a sentence or formats money. Every «¿Cómo se calculó?» line, and
 * every warning, is a `Msg`: a code and the figures behind it (amounts in
 * whole units, counts, hole numbers, and names and labels as the tournament
 * gives them). One renderer turns them into words (`src/i18n/explain.ts`,
 * the copy in `explain` of src/i18n/es-MX.ts), with the tournament's
 * currency, so a second language is a file and a second currency is data.
 *
 * `MsgParams` is the contract: one entry per code, its params' shape. The
 * catalog in es-MX.ts must cover every code (TypeScript checks it), and a
 * code's params are only data, never words: a nested `Msg` where a sentence
 * is built of others.
 */

/** A name or label as data (a player, a game's label from the settings, a flow's label). */
type Name = string

/**
 * Every computed number carries one of these so the UI can render
 * "¿Cómo se calculó?" (§6): a title and its steps, each a `Msg`.
 */
export interface Explanation {
  title: Msg
  steps: Msg[]
}

/**
 * An explanation already in words: the rules of a format and a game's
 * description, for the info sheet and the Reglamento (ARCH-05's second stage
 * turns them into codes too).
 */
export interface ExplanationText {
  title: string
  steps: string[]
}

/** The holes a countback step compares: the whole round, or holes `from`–`to`. */
export interface HoleWindow {
  from: number
  to: number
  total: boolean
}
/** How one side of a match stands on the last day: not played (the day is over), not out yet, over, under way. */
export type MatchSide = 'notPlayed' | 'notOut' | 'done' | 'going'
/** What a game counts and pays by: a skin, a birdie, an eagle, a three-putt, a hole won, a bet, a share of a bet. */
export type GameUnit = 'skin' | 'birdie' | 'eagle' | 'threePutt' | 'hole' | 'bet' | 'part'
/** What a main-event figure counts: points, strokes net or gross, or match points. */
export type FigureUnit = 'points' | 'net' | 'gross' | 'match'

export interface MsgParams {
  // ---- Generic -----------------------------------------------------------
  /**
   * A label or name the tournament gives, said as it is: a game's label from the settings, a player's
   * name, an engine label not yet a code (ARCH-05's second stage: prize, flow and slot labels).
   */
  label: { text: string }
  /** An amount, as a title: «$10,000». */
  amount: { amount: number }
  /** Stableford points: «1 pt», «34 pts». */
  pts: { n: number }

  // ---- A hole's points (core/compute.ts) ---------------------------------
  'hole.unplayed': Record<string, never>
  'hole.pickedUp': Record<string, never>
  'hole.played': { gross: number; par: number; received: number; si: number; net: number; points: number }
  'hole.net': { gross: number; received: number; net: number }
  'hole.points': { par: number; received: number; gross: number; points: number }

  // ---- A hole in strokes (formats/strokePlay.ts) -------------------------
  'strokes.title': { strokes: number; net: boolean }
  'strokes.pickedUp': { par: number; net: boolean; received: number; si: number; counted: number; toPar: number }
  'strokes.played': { gross: number; par: number; net: boolean; received: number; si: number; counted: number; toPar: number }
  'strokes.pickupRule': { par: number; received: number }
  'strokes.pickupNet': { par: number; received: number; counted: number }
  'strokes.net': { gross: number; received: number; counted: number }

  // ---- Handicaps (core/handicap.ts, core/compute.ts) ---------------------
  'hcp.indexTitle': { value: number }
  'hcp.indexTyped': Record<string, never>
  'hcp.baseTitle': { value: number }
  'hcp.baseTyped': Record<string, never>
  'hcp.plusInSum': { value: number }
  'hcp.playingTitle': { value: number }
  'hcp.cap': { hcp: number; cap: number }
  'hcp.allowance': { pct: number; of: number; result: number }
  'hcp.rounded': { value: number }
  'hcp.givesBack': { value: number }
  'hcp.courseTitle': { value: number }
  'hcp.courseScale': { index: number; slope: number; scaled: number }
  'hcp.courseRating': { rating: number; par: number; diff: number }
  'hcp.courseSum': { scaled: number; diff: number; raw: number; value: number }
  'hcp.override': { from: number; to: number; reason: string | null }
  'hcp.nine': { half: number }
  'est.title': { value: number }
  'est.diffs': { d: [number, number, number] }
  'est.weighted': { w: [number, number, number]; d: [number, number, number]; result: number }
  'est.rounded': { value: number; written: boolean }
  'est.cap': { cap: number; value: number }
  'est.reordered': Record<string, never>
  'est.assumed': Record<string, never>
  'cut.title': { value: number }
  'cut.notPlayed': Record<string, never>
  'cut.under': { points: number; threshold: number }
  'cut.over': { points: number; threshold: number; over: number }
  'cut.per': { per: number; over: number }
  'cut.max': { max: number }
  /** «El día 1 hizo 37 pts: …; se recorta…»: a day's cut, its steps in one line. */
  'cut.day': { day: number; steps: Msg[] }
  'cut.plusKeeps': { value: number }
  'cut.applied': { playing: number; cut: number; after: number }
  'core.noCourse': { day: number }

  // ---- Formats' warnings (formats/*.ts) ----------------------------------
  'match.needsPairs': { day: number | null; group: number }
  'match.needsTwo': { day: number | null; group: number }
  'team.noTeams': Record<string, never>
  'bracket.tooFew': Record<string, never>
  /** `round`: the bracket round's name, as the state names it. */
  'bracket.offBracket': { day: number; off: number; round: string }
  'bracket.tied': { round: string }
  'bracket.needsRounds': { rounds: number; have: number }

  // ---- Places and prizes (core/ranking.ts, modules/individual) -----------
  /** A game's places with a prize nobody filled, once it is over: `count` entrants (of `unit`) had a result. */
  'rank.unfilled': { label: Name; day: number | null; places: number[]; count: number; unit: 'player' | 'team' | 'pair'; amount: number }
  'prize.place': { place: number; amount: number }
  'prize.tie': { n: number; place: number; places: number[]; total: number }
  'prize.tieSplit': { total: number; n: number; each: number; rounding: number }
  'prize.tied': { names: Name[] }
  'individual.incomplete': { cards: Array<{ name: Name; thru: number; of: number }> }
  /** Where a main-event prize comes from: the place (its label, «T3») and the figure as the board shows it. */
  'individual.where': { name: Name; final: boolean; place: string; figure: string; value: number; kind: FigureUnit }
  'individual.teamSplit': { team: Name; n: number; total: number; each: number; rounding: number }
  'countback.title': { name: Name; tied: boolean }
  'countback.line': { day: number; window: HoleWindow; aName: Name; a: number; bName: Name; b: number; up: boolean }
  'countback.equalTo': { hole: number }
  'countback.matchPoints': Record<string, never>
  'countback.matchShare': Record<string, never>
  'countback.matchNone': { day: number; over: boolean }
  'countback.matchSame': { day: number; done: boolean; aName: Name; a: number; bName: Name; b: number }
  'countback.matchSides': { day: number; aName: Name; aSide: MatchSide; a: number; bName: Name; bSide: MatchSide; b: number }

  // ---- The side games (modules/*) ----------------------------------------
  'pairs.notPairs': Record<string, never>
  /** `kinds`: the pairing rule's labels («AD», «BC»). */
  'pairs.wrongKinds': { kinds: string[] }
  'pairs.eachTitle': { each: number }
  /** A pair's prize between the two, the odd peso to `to`. */
  'pairs.split': { total: number; each: number; odd: number; to: Name }
  'bestRound.day': { points: number; day: number }
  'bestRound.countback': { window: HoleWindow; aName: Name; a: number; bName: Name; b: number }
  'putts.total': { putts: number; holes: number }
  'putts.pickups': { min: number }
  /** `game`: the snake's label as the settings name it. */
  'snake.holder': { game: Name; threshold: number; hole: number }
  'snake.holderPays': { game: Name }
  'snake.survivor': { game: Name; holder: Name }
  'snake.survivorGets': { amount: number }
  'snake.nobody': { threshold: number; pot: number; n: number }

  // ---- The Calcutta (modules/auction) ------------------------------------
  /** Where a slot's group finished: its place, and among the lots sold when a player ahead is not in the Calcutta. */
  'auction.finish': { names: Name[]; at: { finish: number; amongSold: number | null }; share: number }
  'auction.teamShare': { share: number; n: number }
  'auction.tie': { places: number; at: { finish: number; amongSold: number | null }; shares: number[]; share: number }
  'auction.tieTeams': { share: number; teams: number }
  'auction.tieEach': { share: number; n: number }
  'auction.nobodyAt': { place: number }
  /** `any`: the tier has players, all of them cashing a better slot. */
  'auction.tierNone': { tier: string; any: boolean }
  'auction.bestOfTier': { tier: string; names: Name[]; place: number }
  'auction.tieSplit': { n: number }
  'auction.lastCashes': Record<string, never>
  'auction.last': { names: Name[] }
  'auction.staysInBank': Record<string, never>
  /** A slot's share of the pot, centavos kept (`raw`). */
  'auction.shareOf': { share: number; pot: number; raw: number }
  'auction.wholeUnfilled': { amount: number }
  'auction.whole': { amount: number }
  'auction.plusRounding': { rounding: number; paid: number }
  'auction.ownerPct': { pct: number; name: Name }
  'auction.rounding': { champion: boolean; name: Name }
  /** `label`: the Calcutta's label; `slots`: the unfilled slots' labels. */
  'auction.unfilled': { label: Name; amount: number; slots: Name[] }
  'auction.noResult': { label: Name; pot: number }
  'auction.unsold': { label: Name; names: Name[] }

  // ---- The instance games (games/*) --------------------------------------
  /** A pot paid by places: `side` when its entrants put it in (a «bote»), else it comes from the inscriptions. */
  'game.places': { pot: number; side: boolean; split: number[] }
  'game.unitsPot': { pot: number; side: boolean; total: number; unit: GameUnit; per: number }
  'game.unitsWon': { name: Name; units: number; unit: GameUnit; amount: number; rounding: number }
  'game.refund': { unit: GameUnit; buyIn: number }
  'game.unwon': { label: Name; unit: GameUnit; pot: number }
  'bet.units': { name: Name; units: number; unit: GameUnit; stake: number }
  'bet.net': { gross: number; back: number; winner: Name; amount: number }
  'bet.pays': { payer: Name; amount: number }
  /** A match's bet: `segment` its label («Ida»), `day` when the game covers several. */
  'match.bet': { day: number | null; segment: Name; press: number; from: number; side: Name[]; up: number; decided: boolean; stake: number }
  'match.invalid': { label: Name; n: number }
  'contest.disputed': { label: Name; holes: number[] }

  // ---- The settlement (core/money.ts) ------------------------------------
  /** A part of an amount people pay by, signed from the payer's side; `of` when part of it was paid already. */
  'settle.part': { label: Name; amount: number; of: number | null }
  /** A party is a name, or null for the bank. */
  'settle.squared': { from: Name | null; to: Name | null }
  'settle.pays': { from: Name | null; to: Name | null; amount: number; bankerSelf: boolean }
  'settle.nets': Record<string, never>
  'settle.total': { amount: number }
  'settle.owesTotal': { name: Name | null; amount: number }
  'settle.getsTotal': { name: Name | null; amount: number }
  'settle.ruleTitle': Record<string, never>
  'settle.rule': Record<string, never>
  'settle.share': { from: Name | null; total: number; amount: number; to: Name | null }
  'settle.bankTitle': Record<string, never>
  'settle.gross': Record<string, never>
  'settle.bankIn': { what: Msg; amount: number }
  'settle.bankOut': { what: Msg; amount: number }
  'settle.entries': { n: number; fee: number }
  'settle.lots': { n: number }
  'settle.mainPrizes': Record<string, never>
  'settle.calcuttaShares': Record<string, never>
  'settle.bankInTotal': { amount: number }
  'settle.bankOutTotal': { amount: number }
  'settle.houseCut': { amount: number }
  'settle.toHouse': { amount: number }
  'settle.squares': Record<string, never>
  'settle.left': { amount: number }
  'settle.short': { amount: number }

  // ---- Por asignar (core/unassigned.ts) ----------------------------------
  'unassigned.title': { amount: number }
  'unassigned.budget': { label: Name; amount: number }
  'unassigned.paid': { amount: number }
  'unassigned.left': { amount: number }
  'unassigned.decides': Record<string, never>
  'unassigned.heldApart': { amount: number }
  'unassigned.poolSurplus': { entries: number; prizes: number }
  'unassigned.unplayedRound': { day: number }
  'unassigned.cancelledRound': { day: number }
  /** A warning that opens with the bucket's game, without its «El Comité decide». */
  'unassigned.own': { warning: Msg }
  'unassigned.heldTitle': { amount: number }
  'unassigned.pendingTiebreak': { day: number; group: number; hole: number }
  /** `game`: the snake's label. */
  'unassigned.heldWhy': { amount: number; game: Name }
  'unassigned.from': { label: Name; amount: number }
  /** The Comité's reason; a link to watch carries none (its free text stays with the members, STRAT-05). */
  'unassigned.decided': { reason: string | null }
  'unassigned.over': { label: Name; assigned: number; left: number }
  'unassigned.orphan': { label: Name; amount: number }
  'unassigned.mismatch': { bank: number; listed: number }

  // ---- The tournament's warnings (computeTournament.ts) ------------------
  /** A side game of a type this build does not know. */
  'outdated.game': { label: Name }
  'putts.missing': { who: Array<{ name: Name; days: Array<{ day: number; holes: number[] }> }>; games: Name[] }
  'pool.short': { prizes: number; entries: number; missing: number }
  'pool.surplus': { entries: number; prizes: number; left: number }
  /** A place the field can no longer fill: `detail` as the prize check words it. */
  'pool.unreachable': { label: Name; detail: string; amount: number }

  // ---- «Cerrar torneo» (close.ts) -----------------------------------------
  'close.missingRounds': { days: number[] }
  'close.openRounds': { days: number[] }
  'close.tiebreaks': { n: number; game: Name }
  'close.missingPutts': { n: number }
  'close.unsoldLots': { names: Name[] }
  'close.unassigned': { amount: number }
  'close.badAssignments': { n: number }
  'close.unsignedCards': { n: number }
  'close.rejectedWrites': { n: number }
  'close.rejectedUnavailable': Record<string, never>
  'close.owed': { people: number; amount: number }
}

export type MsgCode = keyof MsgParams

/** One thing the engine says: a code and its figures. */
export type Msg = { [K in MsgCode]: { code: K; params: MsgParams[K] } }[MsgCode]

/** A message of `code` with `params`. */
export function msg<K extends MsgCode>(code: K, params: MsgParams[K]): Msg {
  return { code, params } as Msg
}

const NONE = Object.freeze({}) as Record<string, never>
/** A message with no figures, shared (it is never written into). */
export function say<K extends { [C in MsgCode]: MsgParams[C] extends Record<string, never> ? C : never }[MsgCode]>(code: K): Msg {
  return { code, params: NONE } as Msg
}

/** A name or label as data. */
export const label = (text: Name): Msg => ({ code: 'label', params: { text } })

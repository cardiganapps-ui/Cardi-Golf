/**
 * Seeded generator of random but valid tournaments (snapshot + settings) for
 * the MONEY panel's property tests. Deterministic: gen(seed) is a pure
 * function of the seed. Covers: field sizes 2–60, 1–4 rounds, 9/18 holes,
 * start hole 1/10, cancelled/scheduled/live/finished rounds, pick-ups,
 * missing putts, tiers (incl. empty ones), random module on/off, amount and
 * percent individual prizes, pairs, Calcutta with bids/buybacks/unsold lots,
 * payments, instance games.
 */
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import type { TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { checkPrizePool, fieldShape, snakePotPerGroup } from '/home/user/Cardi-Golf/src/engine/settings/prizeCheck'
import type { GameConfig } from '/home/user/Cardi-Golf/src/engine/settings/games'
import { PAR_72, makeHoles, makePlayer, makeRound, makeSnapshot, score } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
import type { Course, Group, Player, Round, Snapshot } from '/home/user/Cardi-Golf/src/engine/types'

export function rng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T,>(xs: T[]): T[] => {
      const a = [...xs]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j]!, a[i]!]
      }
      return a
    },
  }
}
export type Rng = ReturnType<typeof rng>

export interface GenOpts {
  /** Force every counted round finished, every card complete, every snake tiebreak answered. */
  clean?: boolean
  /** Upper bound on the field. */
  maxPlayers?: number
  /** Probability of each module being on. */
  moduleP?: number
  /** Allow instance games. */
  games?: boolean
  /** Force the main format (default: stableford). */
  format?: 'stableford' | 'strokePlay' | 'matchPlay' | 'team'
}

export interface Gen {
  snap: Snapshot
  settings: TournamentSettings
  meta: Record<string, unknown>
}

function fieldSize(r: Rng, max: number): number {
  const x = r.next()
  if (x < 0.55) return r.int(2, Math.min(12, max))
  if (x < 0.85) return r.int(2, Math.min(24, max))
  return r.int(2, max)
}

/** Split `total` into k non-increasing whole-peso prizes (some may be 0). */
function splitAmount(r: Rng, total: number, k: number): number[] {
  if (k <= 0) return []
  const w = Array.from({ length: k }, (_, i) => (k - i) * (0.5 + r.next()))
  const sw = w.reduce((a, b) => a + b, 0)
  const out = w.map((x) => Math.floor((total * x) / sw))
  out[0]! += total - out.reduce((a, b) => a + b, 0)
  return out.sort((a, b) => b - a)
}

function percentSplit(r: Rng, k: number): number[] {
  if (k === 1) return [100]
  const out = splitAmount(r, 100, k)
  return out
}

export function gen(seed: number, opts: GenOpts = {}): Gen {
  const r = rng(seed)
  const clean = !!opts.clean
  const maxPlayers = opts.maxPlayers ?? 60
  const n = fieldSize(r, maxPlayers)
  const base: TournamentSettings = structuredClone(r.chance(0.4) ? FIRST_TOURNAMENT_SETTINGS : DEFAULT_SETTINGS)
  const settings = base
  const moduleP = opts.moduleP ?? 0.5

  // Tiers.
  const tierMode = r.int(0, 3)
  settings.tiers = tierMode === 0 ? [] : tierMode === 1 ? ['A', 'B', 'C', 'D'] : tierMode === 2 ? ['A', 'B'] : ['X', 'Y', 'Z']
  const usedTiers = settings.tiers.length ? r.shuffle(settings.tiers).slice(0, r.int(1, settings.tiers.length)) : []

  // Players.
  const players: Player[] = Array.from({ length: n }, (_, i) => {
    const src = r.next()
    const base = r.chance(0.2) ? r.int(0, 54) : Math.round(r.next() * 360) / 10
    return makePlayer(i + 1, {
      tier: usedTiers.length ? r.pick(usedTiers) : null,
      baseHcp: base,
      handicapSource: src < 0.75 ? 'manual' : src < 0.95 ? 'index' : 'estimate',
      handicapIndex: src >= 0.75 && src < 0.95 ? base : null,
      estimateInputs: src >= 0.95 ? [{ gross: r.int(70, 95), rating: null, slope: null, par: null }, { gross: r.int(80, 105), rating: 71.5, slope: 125, par: 72 }, { gross: r.int(85, 125), rating: null, slope: null, par: null }] : null,
      isHonoree: i === 0 && r.chance(0.3),
      sortOrder: i,
      defaultTeeId: r.chance(0.8) ? 'tee1' : 'tee2',
    })
  })

  // Course: two tees, the second rated.
  const course: Course = {
    id: 'course1',
    name: 'Campo',
    tees: [
      { id: 'tee1', courseId: 'course1', name: 'Azules', color: 'blue', rating: r.chance(0.5) ? 71.3 : null, slope: r.chance(0.5) ? 131 : null, holes: makeHoles() },
      { id: 'tee2', courseId: 'course1', name: 'Rojas', color: 'red', rating: 68.2, slope: 117, holes: makeHoles(PAR_72.map(([p, si]) => [p === 5 && r.chance(0.3) ? 4 : p, si] as [number, number])) },
    ],
  } as unknown as Course

  // Rounds.
  const nRounds = r.int(1, 4)
  const rounds: Round[] = Array.from({ length: nRounds }, (_, i) => {
    const holes = r.chance(0.85) ? 18 : 9
    let status: Round['status'] = 'finished'
    if (!clean) {
      const x = r.next()
      status = x < 0.55 ? 'finished' : x < 0.8 ? 'live' : x < 0.9 ? 'cancelled' : 'scheduled'
    }
    return makeRound(i + 1, { holes: holes as 9 | 18, status })
  })
  settings.rounds = Math.max(1, nRounds)
  settings.groupSize = opts.format === 'matchPlay' ? (r.chance(0.5) ? 2 : 4) : r.int(2, 4)

  // Modules.
  const on = (p: number) => r.chance(p)
  settings.modules.individual.enabled = on(0.9)
  settings.modules.bestRound.enabled = on(moduleP)
  settings.modules.snake.enabled = on(moduleP)
  settings.modules.fewestPutts.enabled = on(moduleP)
  settings.modules.auction.enabled = on(moduleP)
  settings.modules.pairs.enabled = on(moduleP) && n >= 2
  settings.modules.snake.puttsThreshold = r.chance(0.8) ? 3 : r.int(2, 4)
  if (opts.format && opts.format !== 'stableford') {
    settings.modules.individual.format = opts.format
    settings.modules.individual.formatOptions = {
      scoring: r.pick(['net', 'gross'] as const),
      matchMode: opts.format === 'matchPlay' ? r.pick(['singles', 'fourball'] as const) : 'singles',
      teamMode: r.pick(['scramble', 'bestBall', 'shamble'] as const),
      teamScoring: r.pick(['strokes', 'stableford'] as const),
    }
  }
  // Pairing rules only over configured tiers.
  if (settings.tiers.length >= 2 && r.chance(0.6)) {
    const t = r.shuffle(settings.tiers)
    settings.modules.pairs.pairing = t.length >= 4 ? [[t[0]!, t[1]!], [t[2]!, t[3]!]] : [[t[0]!, t[1]!]]
  } else settings.modules.pairs.pairing = []
  settings.modules.pairs.honoreePicks = false

  // Handicap rules.
  settings.handicap.allowance = r.pick([1, 0.8, 0.9, 0.75, 0.85, 0.95])
  settings.handicap.cap = r.pick([54, 54, 36, 40, 28])
  settings.handicap.rounding = r.pick(['halfUp', 'halfUp', 'floor', 'nearestEven'] as const)
  settings.handicap.perRoundSlope = r.chance(0.3)
  settings.day2Cut = { threshold: r.pick([36, 36, 34, 38]), pointsPerStroke: r.int(1, 3), maxStrokes: r.pick([0, 4, 4, 2, 6]), mode: r.pick(['previous', 'cumulative'] as const) }
  settings.pickupPuttsForFewestPutts = r.pick([3, 3, 2, 0])
  settings.houseCut = 0

  // Groups per round (every non-cancelled round gets groups; cancelled rounds keep theirs too).
  const groups: Group[] = []
  for (const round of rounds) {
    const order = r.shuffle(players.map((p) => p.id))
    let gnum = 0
    for (let i = 0; i < order.length; ) {
      let size = settings.groupSize
      const left = order.length - i
      if (left < size) size = left
      if (left - size === 1 && size > 2) size -= 1 // avoid a group of 1 when possible
      const ids = order.slice(i, i + size)
      i += size
      gnum++
      const start = round.holes === 18 && r.chance(0.35) ? 10 : 1
      groups.push({ id: `${round.id}g${gnum}`, roundId: round.id, number: gnum, teeTime: null, startHole: start, playerIds: ids })
    }
  }

  // Money settings.
  const fee = r.chance(0.15) ? 0 : r.pick([100, 250, 500, 1000, 2500, 333, 777])
  settings.entryFee = fee
  const pot = fee * n
  const groupSizes = rounds.map((rd) => groups.filter((g) => g.roundId === rd.id).map((g) => g.playerIds.length))
  let rest = pot
  // Snake: real group sizes.
  if (settings.modules.snake.enabled) {
    const ps = r.pick([0, 50, 100, 200])
    const snakeTotal = groupSizes.reduce((s, sizes) => s + sizes.reduce((x, k) => x + ps * Math.max(0, k - 1), 0), 0)
    if (snakeTotal <= rest) {
      settings.prizes.snakePerSurvivor = ps
      rest -= snakeTotal
    } else settings.prizes.snakePerSurvivor = 0
  } else settings.prizes.snakePerSurvivor = r.pick([0, 200])
  if (settings.modules.bestRound.enabled) {
    const per = Math.min(Math.floor(rest / (4 * nRounds)), r.pick([0, 100, 300, 1200]))
    settings.prizes.bestRoundPerDay = Math.max(0, per)
    rest -= settings.prizes.bestRoundPerDay * nRounds
  } else settings.prizes.bestRoundPerDay = r.pick([0, 1200])
  if (settings.modules.fewestPutts.enabled) {
    const fp = Math.min(Math.floor(rest / 5), r.pick([0, 500, 1000]))
    settings.prizes.fewestPutts = Math.max(0, fp)
    rest -= settings.prizes.fewestPutts
  } else settings.prizes.fewestPutts = r.pick([0, 1000])
  const nPairs = settings.modules.pairs.enabled ? Math.floor(n / 2) : 0
  if (settings.modules.pairs.enabled) {
    const k = Math.max(0, Math.min(nPairs, r.int(0, 3)))
    const total = Math.floor(rest * r.next() * 0.3)
    settings.prizes.pairs = splitAmount(r, total, k)
    rest -= settings.prizes.pairs.reduce((a, b) => a + b, 0)
  } else settings.prizes.pairs = r.chance(0.5) ? [] : [2000, 1000]
  const percent = settings.modules.individual.enabled && r.chance(0.3)
  settings.prizes.stablefordMode = percent ? 'percent' : 'amount'
  const places = Math.max(1, Math.min(n, r.int(1, 5)))
  if (percent) settings.prizes.stableford = percentSplit(r, places)
  else if (settings.modules.individual.enabled) settings.prizes.stableford = splitAmount(r, rest, places)
  else settings.prizes.stableford = []

  // Calcutta payout: always valid (tiers that exist).
  const slotsPool: TournamentSettings['auction']['payout'] = []
  const pAmounts = r.pick([[0.55, 0.2], [0.7, 0.25], [1], [0.5, 0.3, 0.2], [0.6]])
  pAmounts.forEach((s, i) => slotsPool.push({ slot: 'place', place: i + 1, share: s }))
  for (const t of settings.tiers) if (r.chance(0.4)) slotsPool.push({ slot: 'bestOfTier', tier: t, share: r.pick([0.1, 0.05]) })
  if (r.chance(0.6)) slotsPool.push({ slot: 'lastPlace', share: 0.05 })
  const sum = slotsPool.reduce((s, x) => s + x.share, 0)
  // Normalize into integer percent shares that add to exactly 1.
  const pcts = slotsPool.map((x) => Math.floor((x.share / sum) * 100))
  pcts[0]! += 100 - pcts.reduce((a, b) => a + b, 0)
  settings.auction.payout = slotsPool.map((x, i) => ({ ...x, share: pcts[i]! / 100 })).filter((x) => x.share > 0)
  if (Math.abs(settings.auction.payout.reduce((s, x) => s + x.share, 0) - 1) > 1e-9) settings.auction.payout = [{ slot: 'place', place: 1, share: 1 }]
  settings.auction.buybackMaxPct = r.pick([50, 50, 25, 0, 100])

  // Instance games.
  settings.games = []
  if (opts.games !== false && r.chance(0.35)) {
    const gs: GameConfig[] = []
    if (r.chance(0.5)) gs.push({ id: 'skins', type: 'skins', label: 'Skins', enabled: true, rounds: 'all', entrants: 'all', options: { basis: r.pick(['net', 'gross'] as const), carryOver: r.chance(0.7) }, money: { source: r.pick(['side', 'direct', 'none'] as const), buyIn: 100, amount: 0, stake: 20, split: [100] } } as GameConfig)
    if (r.chance(0.4)) gs.push({ id: 'low', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants: 'all', options: { basis: r.pick(['net', 'gross', 'points'] as const), scope: r.pick(['overall', 'perRound'] as const) }, money: { source: 'side', buyIn: 150, amount: 0, stake: 0, split: r.pick([[100], [70, 30], [50, 30, 20]]) } } as GameConfig)
    if (r.chance(0.4)) gs.push({ id: 'birdies', type: 'eventPot', label: 'Birdies', enabled: true, rounds: 'all', entrants: 'all', options: { event: r.pick(['birdie', 'eagle'] as const), basis: r.pick(['net', 'gross'] as const) }, money: { source: r.pick(['side', 'direct'] as const), buyIn: 100, amount: 0, stake: 30, split: [100] } } as GameConfig)
    if (r.chance(0.3)) gs.push({ id: 'tres', type: 'eventPot', label: 'Tres putts', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'threePutt', basis: 'gross' }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 20, split: [100] } } as GameConfig)
    settings.games = gs
  }

  const snap = makeSnapshot({ players, rounds, settings, courses: [course as never], groups, status: clean ? 'finished' : r.pick(['live', 'live', 'finished', 'auction'] as const) })
  snap.tournament.bankerPlayerId = r.chance(0.9) ? players[r.int(0, n - 1)]!.id : null

  // Pairs.
  if (settings.modules.pairs.enabled || r.chance(0.2) || opts.format === 'team' || opts.format === 'matchPlay') {
    const ids = r.shuffle(players.map((p) => p.id))
    const maxPairs = opts.format === 'team' || opts.format === 'matchPlay' ? Math.floor(n / 2) : nPairs
    for (let i = 0; i + 1 < ids.length && i / 2 < maxPairs; i += 2) snap.pairs.push({ id: `pair${i / 2 + 1}`, name: null, player1Id: ids[i]!, player2Id: ids[i + 1]!, kind: null, pickedByHonoree: false, drawnAt: null })
  }

  // Scores.
  const holesFor = (rd: Round, pid: string) => {
    const p = players.find((x) => x.id === pid)!
    const tee = p.defaultTeeId === 'tee2' ? course.tees[1]! : course.tees[0]!
    return tee.holes.slice(0, rd.holes)
  }
  for (const rd of rounds) {
    if (rd.status === 'scheduled') continue
    for (const p of players) {
      const hs = holesFor(rd, p.id)
      let thru = hs.length
      if (!clean) {
        if (rd.status === 'live') thru = r.int(0, hs.length)
        else if (r.chance(0.1)) thru = r.int(0, hs.length) // withdrew / missing card
      }
      const g = groups.find((x) => x.roundId === rd.id && x.playerIds.includes(p.id))
      const order = g && g.startHole === 10 ? [...hs.slice(9), ...hs.slice(0, 9)] : hs
      const skill = Math.max(0, p.baseHcp)
      for (const h of order.slice(0, thru)) {
        const sr = Math.floor(skill / 18) + (h.strokeIndex <= Math.round(skill) % 18 ? 1 : 0)
        const picked = r.chance(clean ? 0.03 : 0.05)
        const strokes = Math.max(1, Math.min(15, h.par + sr + r.int(-2, 3)))
        let putts: number | null = r.chance(0.12) ? 3 : r.chance(0.25) ? 1 : 2
        if (r.chance(0.03)) putts = 4
        if (!picked) putts = Math.min(putts, strokes)
        if (!clean && r.chance(0.03)) putts = null
        snap.scores.push(score(rd.id, p.id, h.number, picked ? null : strokes, putts, picked))
      }
    }
  }

  // Overrides, occasionally.
  if (r.chance(0.1) && rounds.length) snap.handicapOverrides.push({ roundId: rounds[0]!.id, playerId: players[0]!.id, playingHcp: r.int(0, 30), reason: 'Prueba', by: null, at: '' })

  // Calcutta.
  if (settings.modules.auction.enabled || r.chance(0.1)) {
    const holdings = new Map<string, number>()
    players.forEach((p, i) => {
      const lotId = `lot${i + 1}`
      const x = r.next()
      const status = clean ? (x < 0.97 ? 'sold' : 'pending') : x < 0.85 ? 'sold' : x < 0.92 ? 'open' : 'pending'
      const nBids = r.int(0, 4)
      let amount = settings.auction.openingBid
      let bidder = p.id
      for (let b = 0; b < nBids; b++) {
        const eligible = players.filter((q) => (holdings.get(q.id) ?? 0) < settings.auction.maxPlayersPerOwner)
        if (!eligible.length) break
        amount += settings.auction.increment * r.int(1, 3)
        bidder = r.pick(eligible).id
        snap.calcuttaBids.push({ id: `bid${i}-${b}`, lotId, bidderId: bidder, amount, createdAt: new Date(Date.UTC(2027, 3, 8, 20, i, b)).toISOString() })
      }
      if (status === 'sold') holdings.set(bidder, (holdings.get(bidder) ?? 0) + 1)
      snap.calcuttaLots.push({ id: lotId, playerId: p.id, lotNumber: i + 1, status, price: status === 'sold' ? amount : null, ownerId: status === 'sold' ? bidder : null, soldAt: null })
      if (status === 'sold' && bidder !== p.id && r.chance(0.35)) {
        const pct = r.pick([25, 50, r.int(1, 50)])
        snap.calcuttaBuybacks.push({ lotId, pct, amount: Math.round((amount * pct) / 100), paid: r.chance(0.5) })
      }
    })
  }

  // Payments, occasionally.
  for (const p of players) if (fee > 0 && r.chance(0.5)) snap.payments.push({ id: `e-${p.id}`, fromPlayerId: p.id, toPlayerId: null, amount: fee, kind: 'entry', paid: true, note: null })

  const check = checkPrizePool(settings, fieldShape(snap, settings))
  return { snap, settings, meta: { seed, n, nRounds, pot, percent, places, nPairs, checkBalanced: check.balanced, checkDiff: check.difference, snakePerGroup: snakePotPerGroup(settings) } }
}

/** Answer every pending snake tiebreak with the first candidate (loops: an answer can reveal the next question). */
export function answerSnake(snap: Snapshot, settings: TournamentSettings, compute: (s: Snapshot, t: TournamentSettings) => { flags: { pendingSnakeTiebreaks: Array<{ roundId: string; groupId: string; hole: number; candidates: string[] }> } }) {
  for (let i = 0; i < 40; i++) {
    const pending = compute(snap, settings).flags.pendingSnakeTiebreaks
    if (!pending.length) return
    for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[q.candidates.length - 1]! })
  }
}

/**
 * The example tournament on `/demo` (STRAT-17): a finished two-day event of
 * twelve made-up people with every game the first tournament plays (the
 * Stableford, the best round, the pairs, the snake, fewest putts and the
 * Calcutta), so a curious organizer sees a live board, the Calcutta and the
 * settlement before any account.
 *
 * Production code on purpose: the design fixtures (src/dev) and the engine's
 * test builders never ship (ARCH-07, src/lib/noDevCode.ts), so this has its
 * own small builder. Pure data, deterministic, computed by the same engine as
 * every tournament. No real person, course or event: names, courses and the
 * event are invented, and nothing here is ever written anywhere.
 */
import { ACCENTS } from '../design/accents'
import { FIRST_TOURNAMENT_SETTINGS } from '../engine/settings/presets'
import type { TournamentSettings } from '../engine/settings/schema'
import type {
  CalcuttaBid,
  CalcuttaLot,
  Course,
  Group,
  Hole,
  Pair,
  Payment,
  Player,
  Round,
  Score,
  Snapshot,
} from '../engine/types'

/** Its store id: the store treats `fixture:` boards as in memory (no fetch, nothing kept on the phone). */
export const DEMO_ID = 'fixture:demo'

const NAMES: Array<[full: string, short: string]> = [
  ['Andrés Fuentes', 'Andrés'],
  ['Bruno Salas', 'Bruno'],
  ['Carlos Mena', 'Carlos'],
  ['Daniel Ochoa', 'Daniel'],
  ['Emilio Rangel', 'Emilio'],
  ['Felipe Arce', 'Felipe'],
  ['Gerardo Luna', 'Gerardo'],
  ['Héctor Vidal', 'Héctor'],
  ['Ismael Prado', 'Ismael'],
  ['Jorge Tapia', 'Jorge'],
  ['Luis Robles', 'Luis'],
  ['Mario Cantú', 'Mario'],
]
const TIERS = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'D']
const HCPS = [5, 8, 11, 13, 14, 16, 18, 20, 22, 25, 28, 32]

/** Two invented par-72 cards: [par, stroke index] per hole. */
const CARDS: Array<Array<[number, number]>> = [
  [
    [4, 7],
    [4, 11],
    [3, 17],
    [5, 3],
    [4, 1],
    [4, 13],
    [3, 15],
    [4, 9],
    [5, 5],
    [4, 8],
    [3, 18],
    [4, 2],
    [5, 12],
    [4, 4],
    [4, 10],
    [3, 16],
    [4, 6],
    [5, 14],
  ],
  [
    [5, 9],
    [4, 3],
    [4, 13],
    [3, 17],
    [4, 1],
    [4, 7],
    [3, 15],
    [5, 11],
    [4, 5],
    [4, 6],
    [4, 14],
    [3, 18],
    [5, 2],
    [4, 10],
    [4, 4],
    [3, 16],
    [4, 12],
    [5, 8],
  ],
]

/** The same small LCG the engine's own tests use: the same tournament every time. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function course(n: number, name: string): Course {
  const holes: Hole[] = CARDS[n]!.map(([par, si], i) => ({ number: i + 1, par, strokeIndex: si, yards: null }))
  return {
    id: `demo-c${n + 1}`,
    name,
    tees: [
      {
        id: `demo-t${n + 1}`,
        courseId: `demo-c${n + 1}`,
        name: 'Azules',
        color: 'blue',
        rating: null,
        slope: null,
        holes,
      },
    ],
  }
}

/** A day's holes for every player: near net par, a few birdies and blow-ups, at most one three-putt per group and hole. */
function playDay(snap: Snapshot, round: Round, seed: number, at: number): Score[] {
  const rnd = rng(seed)
  const holes = snap.courses.find((c) => c.id === round.courseId)!.tees[0]!.holes
  const out: Score[] = []
  let stamp = at
  for (const g of snap.groups.filter((x) => x.roundId === round.id)) {
    for (const h of holes) {
      // The snake passes on a three-putt; two on the same hole would ask «¿Quién embocó al último?», which a finished example never leaves open.
      let threePutt = false
      for (const pid of g.playerIds) {
        const p = snap.players.find((x) => x.id === pid)!
        const ph = Math.round(p.baseHcp * 0.8)
        const received = Math.floor(ph / 18) + (h.strokeIndex <= ph % 18 ? 1 : 0)
        const noise = Math.floor(rnd() * 5) - 2
        const strokes = Math.max(2, h.par + received + noise)
        const roll = rnd()
        let putts = roll < 0.1 && !threePutt ? 3 : roll < 0.35 ? 1 : 2
        if (putts === 3) threePutt = true
        putts = Math.min(putts, strokes - 1)
        out.push({
          roundId: round.id,
          playerId: pid,
          hole: h.number,
          strokes,
          putts,
          pickedUp: false,
          enteredBy: pid,
          updatedAt: new Date((stamp += 37_000)).toISOString(),
        })
      }
    }
  }
  return out
}

/** The Calcutta, sold: every lot opened at 250 and went up in steps of 250, each buyer within three players. */
function auction(snap: Snapshot): { lots: CalcuttaLot[]; bids: CalcuttaBid[] } {
  const rnd = rng(23)
  const ids = snap.players.map((p) => p.id)
  const holdings = new Map<string, number>()
  const lots: CalcuttaLot[] = []
  const bids: CalcuttaBid[] = []
  const order = [3, 9, 0, 6, 11, 1, 7, 4, 10, 2, 8, 5].map((i) => ids[i]!)
  order.forEach((pid, i) => {
    const lotId = `demo-lot${i + 1}`
    let amount = 250
    let bidder = pid
    const rounds = 1 + Math.floor(rnd() * 5)
    for (let b = 0; b < rounds; b++) {
      const eligible = ids.filter((x) => x !== bidder && (holdings.get(x) ?? 0) < 3)
      if (!eligible.length) break
      amount += 250 * (1 + Math.floor(rnd() * 3))
      bidder = eligible[Math.floor(rnd() * eligible.length)]!
      bids.push({
        id: `demo-bid${bids.length + 1}`,
        lotId,
        bidderId: bidder,
        amount,
        createdAt: new Date(Date.UTC(2027, 2, 4, 3, i, b * 20)).toISOString(),
      })
    }
    holdings.set(bidder, (holdings.get(bidder) ?? 0) + 1)
    lots.push({
      id: lotId,
      playerId: pid,
      lotNumber: i + 1,
      status: 'sold',
      price: amount,
      ownerId: bidder,
      soldAt: new Date(Date.UTC(2027, 2, 4, 3, i, 59)).toISOString(),
    })
  })
  return { lots, bids }
}

/** The example, built fresh: a finished tournament, everything paid in but the prizes. */
export function demoSnapshot(): Snapshot {
  const settings: TournamentSettings = {
    ...FIRST_TOURNAMENT_SETTINGS,
    labels: { ...FIRST_TOURNAMENT_SETTINGS.labels, honoree: 'Homenajeado', trophy: 'el trofeo' },
    timezone: 'America/Mexico_City',
  }
  const players: Player[] = NAMES.map(([fullName, displayName], i) => ({
    id: `demo-p${i + 1}`,
    fullName,
    displayName,
    tier: TIERS[i]!,
    baseHcp: HCPS[i]!,
    handicapSource: 'manual',
    handicapIndex: null,
    estimateInputs: null,
    defaultTeeId: null,
    isHonoree: false,
    isAdmin: false,
    avatarUrl: null,
    formGuide: null,
    sortOrder: i,
  }))
  const p = (n: number) => `demo-p${n}`
  // A with D, B with C: the pairs play together both days, one A+D pair and one B+C pair per group.
  const pairing: Array<[number, number, string, string]> = [
    [1, 10, 'AD', 'Los Madrugadores'],
    [2, 11, 'AD', 'Par y Medio'],
    [3, 12, 'AD', 'Los del Fondo'],
    [4, 7, 'BC', 'Los Cuñados'],
    [5, 8, 'BC', 'Bandera Roja'],
    [6, 9, 'BC', 'Los Tres Putts'],
  ]
  const pairs: Pair[] = pairing.map(([a, b, kind, name], i) => ({
    id: `demo-pair${i + 1}`,
    name,
    player1Id: p(a),
    player2Id: p(b),
    kind,
    pickedByHonoree: false,
    drawnAt: '2027-03-04T04:00:00.000Z',
  }))
  const rounds: Round[] = [
    { id: 'demo-r1', number: 1, date: '2027-03-05', courseId: 'demo-c1', holes: 18, status: 'finished' },
    { id: 'demo-r2', number: 2, date: '2027-03-06', courseId: 'demo-c2', holes: 18, status: 'finished' },
  ]
  const day = (rid: string, sets: number[][]): Group[] =>
    sets.map((ids, i) => ({
      id: `${rid}g${i + 1}`,
      roundId: rid,
      number: i + 1,
      teeTime: `08:${String(i * 10).padStart(2, '0')}`,
      startHole: 1,
      playerIds: ids.map(p),
    }))
  const groups = [
    ...day('demo-r1', [
      [1, 10, 4, 7],
      [2, 11, 5, 8],
      [3, 12, 6, 9],
    ]),
    ...day('demo-r2', [
      [2, 11, 6, 9],
      [3, 12, 4, 7],
      [1, 10, 5, 8],
    ]),
  ]
  const snap: Snapshot = {
    tournament: {
      id: DEMO_ID,
      slug: '',
      name: 'Copa de los Compadres',
      tagline: 'Un torneo de ejemplo, con nombres inventados',
      logoUrl: null,
      accentColor: ACCENTS.find((a) => a.id === 'agua')!.hex,
      joinCode: '',
      status: 'finished',
      currentRoundId: 'demo-r2',
      bankerPlayerId: p(5),
      settings,
      countsForStats: false,
    },
    players,
    courses: [course(0, 'Campo Las Dunas'), course(1, 'Campo El Mirador')],
    rounds,
    groups,
    roundTees: [],
    pairs,
    teams: [],
    scores: [],
    snakeTiebreaks: [],
    cardSignatures: [],
    handicapOverrides: [],
    calcuttaLots: [],
    calcuttaBids: [],
    calcuttaBuybacks: [],
    payments: [],
    gameEntries: [],
    holeAwards: [],
    gameResults: [],
    moneyAdjustments: [],
  }
  snap.scores = [
    ...playDay(snap, rounds[0]!, 11, Date.UTC(2027, 2, 5, 14, 0)),
    ...playDay(snap, rounds[1]!, 12, Date.UTC(2027, 2, 6, 14, 0)),
  ]
  // Every card signed by the other pair of its group (the tarjeta cruzada).
  for (const r of rounds)
    for (const pair of pairs)
      snap.cardSignatures.push({
        roundId: r.id,
        pairId: pair.id,
        signedBy: pair.player1Id,
        signedAt: `${r.date}T20:00:00.000Z`,
      })
  const { lots, bids } = auction(snap)
  snap.calcuttaLots = lots
  snap.calcuttaBids = bids
  // Two players bought part of themselves back from their buyers, one of them paid already.
  const back = lots.filter((l) => l.ownerId !== l.playerId).slice(0, 2)
  snap.calcuttaBuybacks = back.map((l, i) => ({
    lotId: l.id,
    pct: i === 0 ? 50 : 25,
    amount: Math.round(((l.price ?? 0) * (i === 0 ? 50 : 25)) / 100),
    paid: i === 0,
  }))
  // «Se paga antes de dormir»: every entry and every purchase went to the bank on Calcutta night.
  const payments: Payment[] = players.map((pl) => ({
    id: `demo-entry-${pl.id}`,
    fromPlayerId: pl.id,
    toPlayerId: null,
    amount: settings.entryFee,
    kind: 'entry',
    paid: true,
    note: null,
  }))
  const spent = new Map<string, number>()
  for (const l of lots) spent.set(l.ownerId!, (spent.get(l.ownerId!) ?? 0) + (l.price ?? 0))
  for (const [owner, amount] of spent)
    payments.push({
      id: `demo-calcutta-${owner}`,
      fromPlayerId: owner,
      toPlayerId: null,
      amount,
      kind: 'calcutta',
      paid: true,
      note: null,
    })
  snap.payments = payments
  return snap
}

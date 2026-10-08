/**
 * Design fixtures: in-memory tournaments in every state the UI must handle
 * (4 and 60 players; not started, live, finished; each module mix; long
 * names). They never touch Supabase. Used by `/fixture/<name>` routes and
 * `scripts/design-shots.mjs`. Pure data, built from the engine's own test
 * helpers so what renders is exactly what the engine computes.
 */
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import type { TournamentSettings } from '../engine/settings/schema'
import { fillRound, makeFirstTournament, makeGroup, makePlayer, makeRound, makeSnapshot } from '../engine/testing/fixtures'
import type { Player, Snapshot } from '../engine/types'
import type { LookupResult } from '../data/api'
import type { Me } from '../screens/tournament/TournamentGate'

export interface Fixture {
  name: string
  /** One line for the index page. */
  description: string
  snapshot: Snapshot
  me: Me
  lookup: LookupResult
}

const NAMES = [
  'Arturo Beltrán',
  'Bruno Cárdenas',
  'Camilo Duarte',
  'Damián Escalante',
  'Elías Fuentes',
  'Fabián Galindo',
  'Gael Hinojosa',
  'Hugo Iturbide',
  'Iván Jáuregui',
  'Julián Lara',
  'Leonel Mireles',
  'Matías Navarro',
  'Óscar Padilla',
  'Patricio Quiroz',
  'Ramiro Salcedo',
  'Tomás Urrutia',
  'Ulises Valdez',
  'Valentín Zepeda',
  'Aarón Ledesma',
  'Benjamín Osorio',
]

const LONG_NAMES = [
  'Maximiliano Alejandro de la Garza Treviño',
  'Juan Francisco Rodríguez Echeverría',
  'José María Fernández de Córdoba',
  'Ignacio Sebastián Villaseñor Ruiz',
  'Cristóbal Andrés Gutiérrez Mendoza',
  'Enrique Guillermo Ortega y Gasset',
  'Bernardo Alonso Castellanos Peña',
  'Rodrigo Antonio Cervantes Zúñiga',
  'Joaquín Esteban Hinojosa Barrera',
  'Fernando Javier Aguirre Balderas',
  'Sebastián Eduardo Ruvalcaba Ortiz',
  'Luis Ángel Mondragón de la Torre',
]

function short(full: string): string {
  const [first = '', second] = full.split(' ')
  return second && first.length <= 4 ? `${first} ${second[0]}.` : first
}

function withNames(players: Player[], names: string[]): Player[] {
  return players.map((p, i) => ({ ...p, fullName: names[i % names.length]!, displayName: short(names[i % names.length]!) }))
}

function lookupOf(snap: Snapshot): LookupResult {
  const t = snap.tournament
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logoUrl: t.logoUrl,
    accentColor: t.accentColor,
    status: t.status,
    joinCode: t.joinCode,
    players: snap.players.map((p) => ({ id: p.id, displayName: p.displayName, fullName: p.fullName, tier: p.tier, avatarUrl: p.avatarUrl, isHonoree: p.isHonoree, hasPin: true })),
  }
}

/** Deterministic pseudo-random helper (same LCG as the engine fixtures). */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/** Keep only the first `n` holes (in play order from hole 1) of a round for the given players. */
function truncateRound(snap: Snapshot, roundId: string, thru: (playerId: string) => number) {
  snap.scores = snap.scores.filter((s) => s.roundId !== roundId || s.hole <= thru(s.playerId))
}

function stamp(snap: Snapshot, base = Date.UTC(2027, 3, 9, 15, 0)) {
  // Give scores increasing timestamps so the feed reads in order.
  let i = 0
  for (const s of snap.scores) s.updatedAt = new Date(base + i++ * 40_000).toISOString()
}

/**
 * `money: false` is what the rebuilt wizard now produces by default: no entry
 * fee, no prizes, no side pots. The tab bar must not offer Dinero for it.
 */
function minimal(status: 'setup' | 'live', money = true): Fixture {
  const settings: TournamentSettings = money
    ? { ...DEFAULT_SETTINGS, entryFee: 500, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [1200, 800] } }
    : { ...DEFAULT_SETTINGS, entryFee: 0, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [] } }
  const players = withNames(
    Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: [9, 14, 21, 27][i]!, isAdmin: i === 0 })),
    NAMES,
  )
  const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: status === 'setup' ? 'scheduled' : 'live', date: '2027-05-15' })], settings, status })
  snap.tournament = { ...snap.tournament, id: money ? 'fx-min' : 'fx-gloria', slug: `fixture-minimal4-${status}`, name: money ? 'Sábado en Bosques' : 'Sábado por la gloria', tagline: null, joinCode: 'BOSQUE' }
  snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
  if (status === 'live') {
    fillRound(snap, 'r1', 3)
    truncateRound(snap, 'r1', (pid) => (pid === 'p2' ? 11 : 9))
    stamp(snap)
  }
  return { name: money ? `minimal4-${status}` : 'gloria4', description: money ? `4 jugadores, 1 ronda, solo Individual, ${status === 'setup' ? 'sin empezar' : 'en juego (hoyo 9–11)'}` : '4 jugadores, sin dinero: se juega por la pura gloria', snapshot: snap, me: { playerId: 'p1', isOrganizer: false, isAdmin: true }, lookup: lookupOf(snap) }
}

function sellAuction(snap: Snapshot, seed: number) {
  const r = rng(seed)
  const ids = snap.players.map((p) => p.id)
  const holdings = new Map<string, number>()
  const order = [...ids].sort(() => r() - 0.5)
  let bidId = 0
  order.forEach((pid, i) => {
    const lotId = `lot${i + 1}`
    const nBids = Math.floor(r() * 6)
    let amount = 250
    let bidder = pid
    for (let b = 0; b < nBids; b++) {
      const eligible = ids.filter((x) => x !== bidder && (holdings.get(x) ?? 0) < 3)
      if (!eligible.length) break
      amount += 250 * (1 + Math.floor(r() * 3))
      bidder = eligible[Math.floor(r() * eligible.length)]!
      snap.calcuttaBids.push({ id: `bid${++bidId}`, lotId, bidderId: bidder, amount, createdAt: new Date(Date.UTC(2027, 3, 8, 20, 0, b * 30)).toISOString() })
    }
    holdings.set(bidder, (holdings.get(bidder) ?? 0) + 1)
    snap.calcuttaLots.push({ id: lotId, playerId: pid, lotNumber: i + 1, status: 'sold', price: amount, ownerId: bidder, soldAt: new Date(Date.UTC(2027, 3, 8, 20, 5 + i)).toISOString() })
    if (bidder !== pid && r() < 0.35) snap.calcuttaBuybacks.push({ lotId, pct: r() < 0.5 ? 25 : 50, amount: Math.round((amount * (r() < 0.5 ? 25 : 50)) / 100), paid: r() < 0.5 })
  })
}

/** Calcutta night (§10): the first tournament before day 1, nine lots sold, the tenth open with bids, two to go. */
function auction12(): Fixture {
  const snap = makeFirstTournament()
  snap.players = withNames(snap.players, NAMES).map((p, i) => ({ ...p, isAdmin: i === 8, isHonoree: i === 3 }))
  snap.tournament = { ...snap.tournament, id: 'fx-auction', slug: 'fixture-auction12', name: "Nacho's Bachelor Invitational", tagline: 'Los Cabos, abril 2027', joinCode: 'SUBAST', accentColor: '#0f6e77', logoUrl: null, status: 'auction', bankerPlayerId: 'p9' }
  snap.rounds = [makeRound(1, { status: 'scheduled', date: '2027-04-09' }), makeRound(2, { status: 'scheduled', date: '2027-04-10' })]
  snap.tournament.currentRoundId = null
  snap.scores = []
  snap.pairs = []
  sellAuction(snap, 7)
  for (const lot of snap.calcuttaLots) {
    if (lot.lotNumber < 10) continue
    const open = lot.lotNumber === 10
    Object.assign(lot, { status: open ? 'open' : 'pending', ownerId: null, soldAt: null, price: open ? lot.price : 0 })
    if (!open) snap.calcuttaBids = snap.calcuttaBids.filter((b) => b.lotId !== lot.id)
    snap.calcuttaBuybacks = snap.calcuttaBuybacks.filter((b) => b.lotId !== lot.id)
  }
  return {
    name: 'auction12',
    description: 'Noche de la Calcutta: 9 lotes vendidos, el 10 abierto con pujas, 2 por subastar',
    snapshot: snap,
    me: { playerId: 'p9', isOrganizer: false, isAdmin: true },
    lookup: lookupOf(snap),
  }
}

function full12(finished: boolean): Fixture {
  const snap = makeFirstTournament()
  snap.players = withNames(snap.players, NAMES).map((p, i) => ({ ...p, isAdmin: i === 8, isHonoree: i === 3 }))
  snap.tournament = {
    ...snap.tournament,
    id: 'fx-full',
    slug: `fixture-full12-${finished ? 'finished' : 'live'}`,
    name: "Nacho's Bachelor Invitational",
    tagline: 'Los Cabos, abril 2027',
    joinCode: 'NACHO1',
    accentColor: '#0f6e77',
    logoUrl: null,
    status: finished ? 'finished' : 'live',
    bankerPlayerId: 'p9',
  }
  snap.rounds = [makeRound(1, { status: 'finished', date: '2027-04-09' }), makeRound(2, { status: finished ? 'finished' : 'live', date: '2027-04-10' })]
  snap.tournament.currentRoundId = 'r2'
  snap.groups = snap.groups.map((g) => ({ ...g, teeTime: `09:${String((g.number - 1) * 10).padStart(2, '0')}` }))
  fillRound(snap, 'r1', 11)
  fillRound(snap, 'r2', 12)
  if (!finished) {
    truncateRound(snap, 'r2', (pid) => (['p3', 'p12', 'p6', 'p9'].includes(pid) ? 11 : ['p2', 'p11', 'p5', 'p8'].includes(pid) ? 8 : 9))
    // Two three-putts on the same hole in group 1 with no answer yet → pending snake tiebreak.
    for (const s of snap.scores) if (s.roundId === 'r2' && s.hole === 5 && (s.playerId === 'p1' || s.playerId === 'p4')) s.putts = 3
    // One hole overwritten by another device.
    const d = snap.scores.find((s) => s.roundId === 'r2' && s.playerId === 'p10' && s.hole === 3)
    if (d) {
      d.disputed = true
      d.previous = { strokes: (d.strokes ?? 5) + 1, putts: d.putts, picked_up: false, entered_by: 'p4' }
    }
  }
  stamp(snap)
  // Round 1 cards signed except one pair.
  for (const pair of snap.pairs.slice(0, 5)) snap.cardSignatures.push({ roundId: 'r1', pairId: pair.id, signedBy: pair.player1Id, signedAt: '2027-04-09T14:30:00Z' })
  if (finished) for (const pair of snap.pairs) snap.cardSignatures.push({ roundId: 'r2', pairId: pair.id, signedBy: pair.player2Id, signedAt: '2027-04-10T14:30:00Z' })
  sellAuction(snap, 7)
  snap.players.forEach((p, i) => {
    if (i < 10) snap.payments.push({ id: `pay-entry-${p.id}`, fromPlayerId: p.id, toPlayerId: null, amount: 2500, kind: 'entry', paid: true, note: null })
  })
  snap.handicapOverrides.push({ roundId: 'r2', playerId: 'p7', playingHcp: 13, reason: 'Jugó tees rojas el día 1', by: 'p9', at: '2027-04-09T18:00:00Z' })
  return {
    name: `full12-${finished ? 'finished' : 'live'}`,
    description: finished ? '12 jugadores, todos los módulos, torneo terminado (ceremonia, liquidación)' : '12 jugadores, todos los módulos, día 2 en juego; víbora pendiente, hoyo en disputa, tarjeta sin firmar',
    snapshot: snap,
    me: { playerId: 'p9', isOrganizer: false, isAdmin: true },
    lookup: lookupOf(snap),
  }
}

function pairs8(): Fixture {
  const settings: TournamentSettings = {
    ...DEFAULT_SETTINGS,
    modules: {
      ...DEFAULT_SETTINGS.modules,
      bestRound: { enabled: true, label: 'Mejor ronda' },
      pairs: { enabled: true, label: 'Parejas', pairing: [['A', 'B']], honoreePicks: false },
    },
    tiers: ['A', 'B'],
    rounds: 2,
    entryFee: 1000,
    prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3000, 1500, 500], pairs: [1600, 800], bestRoundPerDay: 300 },
  }
  const players = withNames(
    Array.from({ length: 8 }, (_, i) => makePlayer(i + 1, { tier: i < 4 ? 'A' : 'B', baseHcp: [5, 8, 11, 12, 18, 22, 25, 30][i]!, isAdmin: i === 0 })),
    NAMES.slice(4),
  )
  const snap = makeSnapshot({ players, rounds: 2, settings })
  snap.tournament = { ...snap.tournament, id: 'fx-pairs', slug: 'fixture-pairs8', name: 'Copa Tres Marías', tagline: 'Dos días, cuatro parejas', joinCode: 'TRESMA', accentColor: '#7a3e3e' }
  snap.pairs = [1, 2, 3, 4].map((i) => ({ id: `pair${i}`, name: ['Los Cuñados', 'Par y Medio', 'Fore!', 'Los Bogey'][i - 1]!, player1Id: `p${i}`, player2Id: `p${i + 4}`, kind: 'AB', pickedByHonoree: false, drawnAt: null }))
  snap.groups = [makeGroup('r1', 1, ['p1', 'p5', 'p2', 'p6']), makeGroup('r1', 2, ['p3', 'p7', 'p4', 'p8'], 10), makeGroup('r2', 1, ['p1', 'p5', 'p3', 'p7']), makeGroup('r2', 2, ['p2', 'p6', 'p4', 'p8'])]
  snap.rounds = [makeRound(1, { status: 'finished', date: '2027-06-05' }), makeRound(2, { status: 'live', date: '2027-06-06' })]
  snap.tournament.currentRoundId = 'r2'
  fillRound(snap, 'r1', 21)
  fillRound(snap, 'r2', 22)
  truncateRound(snap, 'r2', (pid) => (['p1', 'p5', 'p3', 'p7'].includes(pid) ? 14 : 12))
  stamp(snap)
  return { name: 'pairs8', description: '8 jugadores, Individual + Parejas + Mejor ronda, sin Calcutta ni víbora', snapshot: snap, me: { playerId: 'p2', isOrganizer: false, isAdmin: false }, lookup: lookupOf(snap) }
}

/** A weekend among friends: percent main pot, house cut, and every computed side game. */
function friends8(): Fixture {
  const settings: TournamentSettings = {
    ...DEFAULT_SETTINGS,
    rounds: 2,
    entryFee: 500,
    houseCut: 500,
    prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [50, 30, 20], stablefordMode: 'percent' },
    games: [
      { id: 'skins', type: 'skins', label: 'Skins', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', carryOver: true }, money: { source: 'side', buyIn: 200, amount: 0, stake: 0, split: [100] } },
      {
        id: 'nassau',
        type: 'match',
        label: 'Nassau',
        enabled: true,
        rounds: 'all',
        entrants: 'all',
        options: { format: 'nassau', basis: 'net', pairScoring: 'bestBall', pressAt: 2, maxPresses: 1, matches: [{ id: 'm1', a: ['p1'], b: ['p2'] }, { id: 'm2', a: ['p5', 'p6'], b: ['p7', 'p8'] }] },
        money: { source: 'direct', buyIn: 0, amount: 0, stake: 100, split: [100] },
      },
      { id: 'low', type: 'lowScore', label: 'Low neto del día', enabled: true, rounds: 'all', entrants: 'list', options: { basis: 'net', scope: 'perRound' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [60, 40] } },
      { id: 'birdies', type: 'eventPot', label: 'Birdies', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'birdie', basis: 'gross' }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 50, split: [100] } },
      { id: 'tres-putts', type: 'eventPot', label: 'Tres putts', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'threePutt', basis: 'gross' }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 20, split: [100] } },
      { id: 'cerca', type: 'contest', label: 'Más cerca del hoyo', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: 'par3' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } },
      { id: 'drive', type: 'contest', label: 'Drive más largo', enabled: true, rounds: [2], entrants: 'all', options: { kind: 'longDrive', holes: [14] }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 50, split: [100] } },
      { id: 'tacos', type: 'custom', label: 'El que coma más tacos', enabled: true, rounds: 'all', entrants: 'all', options: { description: 'Cena del sábado. El Comité da fe.' }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 50, split: [100] } },
    ],
  }
  const players = withNames(
    Array.from({ length: 8 }, (_, i) => makePlayer(i + 1, { baseHcp: [4, 9, 12, 15, 18, 21, 24, 28][i]!, isAdmin: i === 0 })),
    NAMES.slice(2),
  )
  const snap = makeSnapshot({ players, rounds: 2, settings })
  snap.tournament = { ...snap.tournament, id: 'fx-friends', slug: 'fixture-friends8', name: 'Fin de semana en Valle', tagline: 'Skins, Nassau y lo que se deje', joinCode: 'VALLE8', accentColor: '#3f6b4f' }
  snap.rounds = [makeRound(1, { status: 'finished', date: '2027-05-15' }), makeRound(2, { status: 'live', date: '2027-05-16' })]
  snap.tournament.currentRoundId = 'r2'
  for (const rid of ['r1', 'r2']) snap.groups.push(makeGroup(rid, 1, ['p1', 'p2', 'p3', 'p4']), makeGroup(rid, 2, ['p5', 'p6', 'p7', 'p8'], 10))
  snap.gameEntries = ['p1', 'p2', 'p3', 'p5', 'p6', 'p8'].map((playerId) => ({ gameId: 'low', playerId }))
  // Closest to the pin (par 3s: 3, 7, 11, 16): day 1 settled, one dispute on the 16th.
  snap.holeAwards = [
    { roundId: 'r1', groupId: 'r1g1', hole: 3, gameId: 'cerca', playerId: 'p2' },
    { roundId: 'r1', groupId: 'r1g2', hole: 7, gameId: 'cerca', playerId: 'p6' },
    { roundId: 'r1', groupId: 'r1g1', hole: 11, gameId: 'cerca', playerId: 'p1' },
    { roundId: 'r1', groupId: 'r1g1', hole: 16, gameId: 'cerca', playerId: 'p4' },
    { roundId: 'r1', groupId: 'r1g2', hole: 16, gameId: 'cerca', playerId: 'p7' },
    { roundId: 'r2', groupId: 'r2g1', hole: 3, gameId: 'cerca', playerId: 'p3' },
  ]
  snap.gameResults = [{ gameId: 'tacos', playerId: 'p8', share: 1 }]
  fillRound(snap, 'r1', 81)
  fillRound(snap, 'r2', 82)
  truncateRound(snap, 'r2', (pid) => (['p1', 'p2', 'p3', 'p4'].includes(pid) ? 13 : 11))
  stamp(snap)
  return { name: 'friends8', description: '8 amigos: bolsa 50/30/20 con "para la casa", skins, Nassau, low neto, birdies, tres putts, concursos y apuesta libre', snapshot: snap, me: { playerId: 'p1', isOrganizer: false, isAdmin: true }, lookup: lookupOf(snap) }
}

function large60(): Fixture {
  const settings: TournamentSettings = {
    ...DEFAULT_SETTINGS,
    modules: {
      ...DEFAULT_SETTINGS.modules,
      snake: { enabled: true, label: 'La Víbora', puttsThreshold: 3 },
      fewestPutts: { enabled: true, label: 'Menos putts' },
    },
    rounds: 2,
    entryFee: 500,
    // 60 × 500 = 30,000 = 20,000 + 15 groups × 2 rounds × 300 + 1,000
    prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [8000, 5000, 3500, 2500, 1000], snakePerSurvivor: 100, fewestPutts: 1000 },
  }
  const r = rng(60)
  const players = Array.from({ length: 60 }, (_, i) => {
    const full = `${NAMES[i % NAMES.length]!.split(' ')[0]} ${NAMES[(i * 7 + 3) % NAMES.length]!.split(' ').slice(1).join(' ')}`
    return makePlayer(i + 1, { fullName: full, displayName: `${full.split(' ')[0]} ${full.split(' ')[1]?.[0] ?? ''}.`, baseHcp: Math.round(3 + r() * 30), isAdmin: i === 0 })
  })
  const snap = makeSnapshot({ players, rounds: 2, settings })
  snap.tournament = { ...snap.tournament, id: 'fx-large', slug: 'fixture-large60', name: 'Member-Guest Club Campestre', tagline: '60 jugadores, 15 grupos', joinCode: 'MEMBER', accentColor: '#2b5b8c' }
  snap.rounds = [makeRound(1, { status: 'finished', date: '2027-08-21' }), makeRound(2, { status: 'live', date: '2027-08-22' })]
  snap.tournament.currentRoundId = 'r2'
  for (const rid of ['r1', 'r2']) {
    for (let g = 0; g < 15; g++) snap.groups.push({ ...makeGroup(rid, g + 1, players.slice(g * 4, g * 4 + 4).map((p) => p.id), g < 8 ? 1 : 10), teeTime: `${String(7 + Math.floor(g / 6)).padStart(2, '0')}:${String((g % 6) * 10).padStart(2, '0')}` })
  }
  fillRound(snap, 'r1', 61)
  fillRound(snap, 'r2', 62)
  const thru = new Map(players.map((p, i) => [p.id, 6 + Math.floor(i / 4)]))
  truncateRound(snap, 'r2', (pid) => Math.min(18, thru.get(pid) ?? 9))
  stamp(snap)
  return { name: 'large60', description: '60 jugadores, 15 grupos, 2 rondas, Individual + Víbora + Menos putts, día 2 en juego', snapshot: snap, me: { playerId: 'p17', isOrganizer: false, isAdmin: true }, lookup: lookupOf(snap) }
}

function longnames(): Fixture {
  const snap = makeFirstTournament()
  snap.players = snap.players.map((p, i) => ({ ...p, fullName: LONG_NAMES[i]!, displayName: LONG_NAMES[i]!.split(' ').slice(0, 2).join(' '), isAdmin: i === 0, isHonoree: i === 3 }))
  snap.tournament = { ...snap.tournament, id: 'fx-long', slug: 'fixture-longnames', name: 'Torneo Anual de Aniversario del Club Campestre de la Ciudad de México', tagline: 'Categoría Senior y Súper Senior, tees azules y blancas', joinCode: 'LARGO1' }
  snap.pairs = snap.pairs.map((p, i) => ({ ...p, name: ['Los Inseparables del Hoyo Diecinueve', 'Sociedad de Amigos del Bogey Doble', 'Par Tres Cuatro Cinco y Sus Amigos', 'Los del Carrito Descompuesto', 'Fundación Nunca Bajamos del Treinta', 'Los Cuñados Incómodos'][i] ?? p.name }))
  snap.courses = [{ ...snap.courses[0]!, name: 'Club de Golf Bosques de Santa Fe, Campo Norte (tees de campeonato)' }]
  snap.rounds = [makeRound(1, { status: 'live', date: '2027-09-04' }), makeRound(2, { status: 'scheduled', date: '2027-09-05' })]
  fillRound(snap, 'r1', 31)
  truncateRound(snap, 'r1', () => 13)
  stamp(snap)
  sellAuction(snap, 3)
  return { name: 'longnames', description: 'Nombres largos por todos lados: jugadores, parejas, torneo y campo', snapshot: snap, me: { playerId: 'p1', isOrganizer: false, isAdmin: true }, lookup: lookupOf(snap) }
}


/** A format that is not Stableford: one tournament per new format. */
function formatFixture(format: 'strokePlay' | 'matchPlay' | 'team', opts: { name: string; slug: string; label: string; description: string; options?: Record<string, string>; teams?: boolean; teamsOf?: number; groupSize?: number; honoree?: number }): Fixture {
  const settings: TournamentSettings = {
    ...DEFAULT_SETTINGS,
    rounds: 1,
    entryFee: 600,
    prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [60, 40], stablefordMode: 'percent' },
    modules: {
      ...DEFAULT_SETTINGS.modules,
      individual: {
        enabled: true,
        label: opts.label,
        format,
        formatOptions: { ...DEFAULT_SETTINGS.modules.individual.formatOptions, ...opts.options },
      },
    },
  }
  const players = withNames(
    Array.from({ length: 8 }, (_, i) => makePlayer(i + 1, { baseHcp: [4, 9, 12, 15, 18, 21, 24, 28][i]!, isAdmin: i === 0, isHonoree: i === opts.honoree })),
    NAMES.slice(4),
  )
  const snap = makeSnapshot({ players, rounds: 1, settings })
  snap.tournament = { ...snap.tournament, id: `fx-${format}`, slug: opts.slug, name: opts.name, tagline: opts.description, joinCode: format.slice(0, 6).toUpperCase(), accentColor: '#2b5b8c' }
  snap.rounds = [makeRound(1, { status: 'live', date: '2027-06-12' })]
  const size = opts.groupSize ?? 4
  for (let i = 0; i < 8; i += size) {
    snap.groups.push(makeGroup('r1', i / size + 1, players.slice(i, i + size).map((p) => p.id), i === 0 ? 1 : 10))
  }
  // Teams of more than two live in `teams`; two-player teams here stay on
  // `pairs`, which is the fallback teamEntrants keeps for a tournament that
  // drew Matrimonios and then switched format.
  if (opts.teamsOf) {
    const n = opts.teamsOf
    const labels = ['Los Compadres', 'Las Palmas', 'Los del Fondo', 'Tres Marías']
    snap.teams = Array.from({ length: Math.ceil(players.length / n) }, (_, i) => ({
      id: `tm${i + 1}`,
      name: labels[i] ?? null,
      number: i + 1,
      playerIds: players.slice(i * n, i * n + n).map((x) => x.id),
      drawnAt: null,
    }))
  }
  if (opts.teams) {
    snap.pairs = [
      { id: 'tA', name: 'Los Compadres', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'tB', name: 'Las Palmas', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'tC', name: 'Los del Fondo', player1Id: 'p5', player2Id: 'p6', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'tD', name: 'Tres Marías', player1Id: 'p7', player2Id: 'p8', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
  }
  fillRound(snap, 'r1', 23)
  return {
    name: opts.slug,
    description: opts.description,
    snapshot: snap,
    me: { playerId: 'p1', isOrganizer: true, isAdmin: true },
    lookup: lookupOf(snap),
  }
}

/**
 * A tournament seconds after «Crear torneo» (UX-06): two days asked for, so two
 * rounds with no course or date, and nobody in it yet. Comité › Torneo shows
 * «Para empezar» with everything still to do.
 */
function justCreated(): Fixture {
  const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 2, entryFee: 0, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [] } }
  const snap = makeSnapshot({ players: [], rounds: [makeRound(1, { status: 'scheduled', date: null, courseId: null }), makeRound(2, { status: 'scheduled', date: null, courseId: null })], settings, status: 'setup' })
  // Just created: no round is current yet (the wizard sets none).
  snap.tournament = { ...snap.tournament, id: 'fx-new', slug: 'fixture-new-setup', name: 'Viaje a Valle', tagline: null, joinCode: 'VALLE1', currentRoundId: null }
  snap.courses = []
  snap.groups = []
  snap.roundTees = []
  return { name: 'new-setup', description: 'Recién creado: dos días sin campo ni fecha, sin jugadores todavía', snapshot: snap, me: { playerId: null, isOrganizer: true, isAdmin: true }, lookup: lookupOf(snap) }
}

const BUILDERS: Record<string, () => Fixture> = {
  'new-setup': justCreated,
  'minimal4-setup': () => minimal('setup'),
  // A tournament with no money at all: the tab bar drops Dinero.
  'gloria4': () => minimal('live', false),
  'minimal4-live': () => minimal('live'),
  'full12-live': () => full12(false),
  'full12-finished': () => full12(true),
  pairs8,
  friends8,
  'stroke8': () => formatFixture('strokePlay', { name: 'Copa del Club', slug: 'stroke8', label: 'Golpes', description: 'Stroke play neto a una vuelta: gana quien menos golpes haga', options: { scoring: 'net' }, honoree: 3 }),
  'match8': () => formatFixture('matchPlay', { name: 'Duelos de Primavera', slug: 'match8', label: 'Match play', description: 'Uno contra uno: cuatro partidos, se gana por hoyos', options: { matchMode: 'singles', scoring: 'net' }, groupSize: 2 }),
  'team8': () => formatFixture('team', { name: 'Scramble de la Casa', slug: 'team8', label: 'Por equipos', description: 'Cuatro equipos jugando la mejor bola', options: { teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'net' }, teams: true }),
  /**
   * A knockout that has actually started: 8 players, 3 days, the quarters
   * drawn the way the bracket seeds them (1v8, 2v7, 3v6, 4v5) and played.
   * The semifinals then show the four winners, waiting for their groups.
   */
  'bracket8': () => {
    const settings: TournamentSettings = {
      ...DEFAULT_SETTINGS,
      rounds: 3,
      entryFee: 800,
      prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [70, 30], stablefordMode: 'percent' },
      modules: {
        ...DEFAULT_SETTINGS.modules,
        individual: { enabled: true, label: 'Match play', format: 'matchPlay', formatOptions: { ...DEFAULT_SETTINGS.modules.individual.formatOptions, matchMode: 'singles', scoring: 'net' } },
      },
    }
    const players = withNames(
      Array.from({ length: 8 }, (_, i) => makePlayer(i + 1, { baseHcp: [4, 9, 12, 15, 18, 21, 24, 28][i]!, isAdmin: i === 0 })),
      NAMES.slice(4),
    )
    const snap = makeSnapshot({ players, rounds: 3, settings })
    snap.tournament = { ...snap.tournament, id: 'fx-bracket', slug: 'bracket8', name: 'Copa Eliminatoria', tagline: 'Ocho jugadores, tres días, uno queda', joinCode: 'BRACKT', accentColor: '#7a3b2e' }
    snap.rounds = [makeRound(1, { status: 'finished', date: '2027-06-12' }), makeRound(2, { status: 'scheduled', date: '2027-06-13' }), makeRound(3, { status: 'scheduled', date: '2027-06-14' })]
    // The seeded quarterfinals: best v worst, and so on inward.
    snap.groups = [
      makeGroup('r1', 1, ['p1', 'p8'], 1),
      makeGroup('r1', 2, ['p2', 'p7'], 1),
      makeGroup('r1', 3, ['p3', 'p6'], 10),
      makeGroup('r1', 4, ['p4', 'p5'], 10),
    ]
    fillRound(snap, 'r1', 1)
    return { name: 'bracket8', description: 'Cuadro de eliminación, cuartos jugados', snapshot: snap, me: { playerId: 'p1', isOrganizer: true, isAdmin: true }, lookup: lookupOf(snap) }
  },
  'scramble8': () =>
    formatFixture('team', {
      name: 'Scramble del Club',
      slug: 'scramble8',
      label: 'Scramble',
      description: 'Dos equipos de cuatro, una bola por equipo',
      options: { teamMode: 'scramble', teamScoring: 'strokes', scoring: 'net' },
      teamsOf: 4,
    }),
  large60,
  longnames,
  auction12,
}

export const FIXTURE_NAMES = Object.keys(BUILDERS)

const cache = new Map<string, Fixture>()
export function getFixture(name: string): Fixture | null {
  const build = BUILDERS[name]
  if (!build) return null
  let f = cache.get(name)
  if (!f) {
    f = build()
    cache.set(name, f)
  }
  return f
}

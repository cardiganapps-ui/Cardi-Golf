/**
 * «Por asignar» (MONEY-05, COPY-09): every source of money the rules leave to
 * the Comité becomes a bucket with a stable key and an explanation, and the
 * Comité's assignments (money_adjustments, 0027) pay it out, refund it pro
 * rata or leave it to the house, with the books still balanced to the peso.
 * An assignment its bucket does not cover is flagged and never paid.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament, type TournamentState } from '../computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import type { GameConfig, GameMoney } from '../settings/games'
import type { TournamentSettings } from '../settings/schema'
import { fillRound, makeFirstTournament, makePlayer, makeRound, makeSnapshot, PAR_72, score } from '../testing/fixtures'
import type { HoleAward, MoneyAdjustment, Snapshot } from '../types'
import { proRata, type UnassignedBucket } from './unassigned'

const S = FIRST_TOURNAMENT_SETTINGS
const PARS = PAR_72.map(([p]) => p)
const run = (snap: Snapshot, settings = snap.tournament.settings as TournamentSettings) => computeTournament(snap, settings)
const money = (over: Partial<GameMoney>): GameMoney => ({ source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over })

let serial = 0
/** One call: every row shares the call's id, the moment and the account, as the server writes them. */
function call(sourceKey: string, rows: Array<Pick<MoneyAdjustment, 'kind' | 'toPlayerId' | 'amount'>>, reason = 'El Comité lo decidió', createdAt?: string): MoneyAdjustment[] {
  serial++
  const at = createdAt ?? `2027-04-12T09:${String(serial % 60).padStart(2, '0')}:00+00:00`
  const callId = `call${String(serial).padStart(4, '0')}`
  return rows.map((r, i) => ({ id: `${callId}-${i}`, callId, sourceKey, reason, createdAt: at, createdBy: 'org', voidedAt: null, voidReason: null, ...r }))
}

/** Every putt a two-putt: no snake, no tiebreak. */
const twoPutts = (snap: Snapshot) => snap.scores.forEach((s) => (s.putts = Math.min(2, s.strokes ?? 2)))

/** The first tournament with day 1 played and day 2 cancelled by the weather (§18.8). */
function cancelledDay2(): Snapshot {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 1)
  twoPutts(snap)
  snap.rounds[0]!.status = 'finished'
  snap.rounds[1]!.status = 'cancelled'
  return snap
}

/** Every snake tiebreak answered (the first candidate holed out last); an answer can bring the group's next tie up. */
function answerAll(snap: Snapshot, settings: TournamentSettings) {
  for (let pending = computeTournament(snap, settings).flags.pendingSnakeTiebreaks; pending.length; pending = computeTournament(snap, settings).flags.pendingSnakeTiebreaks) {
    for (const p of pending) snap.snakeTiebreaks.push({ roundId: p.roundId, groupId: p.groupId, hole: p.hole, lastHoledPlayerId: p.candidates[0]! })
  }
}

const keyed = (st: TournamentState) => Object.fromEntries(st.money.unassigned.buckets.map((b) => [b.key, b.remaining]))

/** The Comité assigns every bucket in full, a different way each time: to one player, pro rata to who paid, to the house. */
function assignAll(st: TournamentState, firstPlayer: string): MoneyAdjustment[] {
  return st.money.unassigned.buckets.flatMap((b: UnassignedBucket, i) => {
    const way = i % 3
    if (way === 0) return call(b.key, [{ kind: 'award', toPlayerId: firstPlayer, amount: b.remaining }])
    if (way === 1 && b.contributors?.length) return call(b.key, proRata(b.remaining, b.contributors).map((c) => ({ kind: 'refund' as const, toPlayerId: c.playerId, amount: c.amount })))
    return call(b.key, [{ kind: 'house', toPlayerId: null, amount: b.remaining }])
  })
}

/** The books: the bank holds nothing unassigned, everyone's net and the bank's sum to zero. */
function expectBalanced(st: TournamentState) {
  expect(st.money.unassigned.total).toBe(0)
  expect(st.money.unassigned.buckets).toEqual([])
  expect(st.money.banker.difference).toBe(0)
  expect(st.money.banker.balanced).toBe(true)
  expect(st.money.netSum).toBe(0)
  for (const f of st.money.flows) expect(Number.isInteger(f.amount), f.label).toBe(true)
  // Sin banco: what moves between people and the bank nets to zero too.
  const net = new Map<string | null, number>()
  for (const tr of st.money.peerToPeer) {
    net.set(tr.from, (net.get(tr.from) ?? 0) - tr.amount)
    net.set(tr.to, (net.get(tr.to) ?? 0) + tr.amount)
  }
  expect([...net.values()].reduce((s, x) => s + x, 0)).toBe(0)
}

describe('a cancelled day: its prizes are «por asignar», by pot, with what happened', () => {
  it('best round and the snake of day 2 are listed, and they are what the bank holds', () => {
    const st = run(cancelledDay2())
    // Play is over (day 1 finished, day 2 cancelled): what Terminado would pay is final, and the rest is listed.
    expect(st.tournamentFinal).toBe(true)
    expect(st.money.unassigned.closing).toBe(true)
    expect(keyed(st)).toEqual({ bestRound: 1200, snake: 1800 })
    expect(st.money.unassigned.total).toBe(3000)
    expect(st.money.banker.difference).toBe(3000)
    const best = st.money.unassigned.buckets.find((b) => b.key === 'bestRound')!
    expect(best.why).toEqual({
      title: '$1,200 sin asignar',
      steps: ['Mejor ronda reparte $2,400', 'Ya se repartió $1,200', 'Día 2 cancelado: su premio no se jugó', 'Quedan $1,200 sin asignar', 'El Comité decide: darlo a alguien, devolverlo o dejarlo para la casa.'],
    })
    // Everyone paid the entry: a refund of entry money goes back to all twelve alike.
    expect(best.contributors).toHaveLength(12)
    expect(best.contributors!.every((c) => c.amount === 2500)).toBe(true)
  })

  it('nothing is listed while a day is still to play', () => {
    const snap = cancelledDay2()
    snap.rounds[1]!.status = 'scheduled'
    const st = run(snap)
    expect(st.money.unassigned.closing).toBe(false)
    expect(st.money.unassigned.buckets).toEqual([])
  })

  it('an award to one player: a prize with the reason, the bucket gone, the bank square on it', () => {
    const snap = cancelledDay2()
    snap.moneyAdjustments = call('bestRound', [{ kind: 'award', toPlayerId: 'p5', amount: 1200 }], 'Mejor ronda del día 1 se lleva los dos')
    const st = run(snap)
    expect(keyed(st)).toEqual({ snake: 1800 })
    const prize = st.prizes.find((p) => p.moduleId === 'adjustment')!
    expect(prize).toMatchObject({ playerId: 'p5', amount: 1200, label: 'Mejor ronda, asignado por el Comité', potId: 'main', final: true, sourceKey: 'bestRound' })
    expect(prize.why.steps).toEqual(['Mejor ronda: $1,200 sin asignar', 'El Comité decidió: Mejor ronda del día 1 se lleva los dos'])
    expect(st.money.people.p5!.prizes['Mejor ronda, asignado por el Comité']).toBe(1200)
    expect(st.money.banker.difference).toBe(1800)
    expect(st.money.unassigned.assignments.map((a) => a.status)).toEqual(['applied'])
    // Vía banco: the bank pays him the prize with the rest of his money.
    expect(st.money.viaBank.some((tr) => tr.settles?.some((a) => a.kind === 'payout' && a.to === 'p5'))).toBe(true)
  })

  it('a pro-rata refund: $150 back to each of the twelve, to the peso', () => {
    const snap = cancelledDay2()
    const st0 = run(snap)
    const snake = st0.money.unassigned.buckets.find((b) => b.key === 'snake')!
    expect(snake.why.steps).toContain('Día 2 cancelado: su premio no se jugó')
    const shares = proRata(snake.remaining, snake.contributors!)
    expect(shares.map((s) => s.amount)).toEqual(Array(12).fill(150))
    snap.moneyAdjustments = call('snake', shares.map((s) => ({ kind: 'refund', toPlayerId: s.playerId, amount: s.amount })), 'Día 2 cancelado: se devuelve')
    const st = run(snap)
    expect(keyed(st)).toEqual({ bestRound: 1200 })
    const back = st.prizes.filter((p) => p.moduleId === 'adjustment').map((p) => [p.playerId, p.amount, p.label])
    expect(back.sort()).toEqual(snap.players.map((p) => [p.id, 150, 'La Víbora, devolución']).sort())
  })

  it('to the house: the banker keeps it beside the house cut, and the books close', () => {
    const snap = cancelledDay2()
    snap.moneyAdjustments = [...call('bestRound', [{ kind: 'house', toPlayerId: null, amount: 1200 }], 'Para la cena del domingo'), ...call('snake', [{ kind: 'house', toPlayerId: null, amount: 1800 }], 'Para las propinas')]
    const st = run(snap)
    expect(st.money.banker.toHouse).toBe(3000)
    expect(st.prizes.some((p) => p.moduleId === 'adjustment')).toBe(false)
    expectBalanced(st)
  })

  it('a void puts the money back in its bucket', () => {
    const snap = cancelledDay2()
    snap.moneyAdjustments = call('bestRound', [{ kind: 'award', toPlayerId: 'p5', amount: 1200 }])
    expect(keyed(run(snap))).toEqual({ snake: 1800 })
    snap.moneyAdjustments = snap.moneyAdjustments.map((a) => ({ ...a, voidedAt: '2027-04-12T10:00:00+00:00', voidReason: 'Se equivocó' }))
    const st = run(snap)
    expect(keyed(st)).toEqual({ bestRound: 1200, snake: 1800 })
    expect(st.money.unassigned.assignments).toEqual([])
    expect(st.prizes.some((p) => p.moduleId === 'adjustment')).toBe(false)
    expect(st.money.banker.difference).toBe(3000)
  })
})

describe('an assignment its bucket does not cover is flagged, never paid', () => {
  it('«Asignación de más»: over what is left, it moves nothing; one that fits before it stays paid', () => {
    const snap = cancelledDay2()
    snap.moneyAdjustments = [...call('bestRound', [{ kind: 'award', toPlayerId: 'p2', amount: 1000 }]), ...call('bestRound', [{ kind: 'award', toPlayerId: 'p3', amount: 300 }])]
    const st = run(snap)
    expect(st.money.unassigned.assignments.map((a) => [a.total, a.status])).toEqual([
      [1000, 'applied'],
      [300, 'over'],
    ])
    expect(keyed(st)).toEqual({ bestRound: 200, snake: 1800 })
    expect(st.prizes.filter((p) => p.moduleId === 'adjustment').map((p) => [p.playerId, p.amount])).toEqual([['p2', 1000]])
    expect(st.flags.warnings).toContain('Asignación de más en Mejor ronda: el Comité asignó $300 y solo quedan $200. No se paga hasta que se anule.')
    expect(st.money.banker.difference).toBe(2000)
  })

  it('snake money an unanswered tiebreak holds is no bucket: it is listed apart, says to answer, and is never the Comité’s to assign', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 3)
    fillRound(snap, 'r2', 4)
    twoPutts(snap)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    // Group 1 of day 2: p1 and p10 both three-putt the 18th, nobody says who holed out last.
    for (const s of snap.scores) if (s.roundId === 'r2' && s.hole === 18 && (s.playerId === 'p1' || s.playerId === 'p10')) Object.assign(s, { strokes: Math.max(s.strokes ?? 0, 4), putts: 3 })
    let st = run(snap)
    expect(st.flags.pendingSnakeTiebreaks).toHaveLength(1)
    expect(keyed(st)).toEqual({})
    expect(st.money.unassigned.total).toBe(0)
    expect(st.money.unassigned.held).toEqual([
      {
        key: 'snake:r2:r2g1',
        label: 'La Víbora, día 2, grupo 1',
        amount: 600,
        note: 'Responde el desempate del hoyo 18 («¿Quién embocó al último?») en Comité, sección Tarjetas.',
        why: { title: '$600 esperan un desempate', steps: ['Día 2, grupo 1: falta decir quién embocó al último en el hoyo 18', 'En cuanto se responda, la víbora reparte los $600 de ese grupo. No es dinero por asignar.'] },
      },
    ])
    // The bank holds it, and the list says so: no mismatch.
    expect(st.money.banker.difference).toBe(600)
    expect(st.flags.warnings.filter((w) => w.startsWith('El banco tiene'))).toEqual([])
    // An award on the snake's line finds no money there: flagged, never paid.
    snap.moneyAdjustments = call('snake', [{ kind: 'award', toPlayerId: 'p4', amount: 600 }])
    st = run(snap)
    expect(st.money.unassigned.assignments.map((a) => a.status)).toEqual(['orphan'])
    expect(st.flags.warnings).toContain('Asignación sin pozo en La Víbora: hay $600 asignados y ahí ya no queda dinero por asignar. No se paga hasta que se anule.')
    expect(st.prizes.some((p) => p.moduleId === 'adjustment')).toBe(false)
    // Answered: the snake pays its group, and nothing is held or paid twice.
    snap.snakeTiebreaks.push({ roundId: 'r2', groupId: 'r2g1', hole: 18, lastHoledPlayerId: 'p10' })
    st = run(snap)
    expect(st.money.unassigned.held).toEqual([])
    expect(st.money.unassigned.assignments.map((a) => a.status)).toEqual(['orphan'])
    expect(st.prizes.some((p) => p.moduleId === 'adjustment')).toBe(false)
    expect(st.money.banker.balanced).toBe(true)
  })

  it('calls are applied in the order they were written, not by their ids', () => {
    const snap = cancelledDay2()
    const first = call('bestRound', [{ kind: 'award', toPlayerId: 'p2', amount: 1200 }], 'Primero', '2027-04-12T09:00:00+00:00')
    const later = call('bestRound', [{ kind: 'award', toPlayerId: 'p3', amount: 1200 }], 'Después', '2027-04-12T09:05:00+00:00')
    // The later call's ids sort first.
    for (const r of later) Object.assign(r, { id: `0-${r.id}`, callId: `0-${r.callId}` })
    snap.moneyAdjustments = [...later, ...first]
    const st = run(snap)
    expect(st.money.unassigned.assignments.map((a) => [a.reason, a.status])).toEqual([
      ['Primero', 'applied'],
      ['Después', 'over'],
    ])
    expect(st.prizes.filter((p) => p.moduleId === 'adjustment').map((p) => p.playerId)).toEqual(['p2'])
  })

  it('two calls written at the same moment by the same account are two decisions', () => {
    const snap = cancelledDay2()
    const at = '2027-04-12T09:00:00+00:00'
    snap.moneyAdjustments = [...call('bestRound', [{ kind: 'award', toPlayerId: 'p2', amount: 1000 }], 'Uno', at), ...call('bestRound', [{ kind: 'award', toPlayerId: 'p3', amount: 1000 }], 'Otro', at)]
    const st = run(snap)
    // One fits, the other is over what is left: never merged into a $2,000 call that pays nothing.
    expect(st.money.unassigned.assignments.map((a) => [a.total, a.status])).toEqual([
      [1000, 'applied'],
      [1000, 'over'],
    ])
  })

  it('while play goes on an assignment waits, and nothing is paid', () => {
    const snap = cancelledDay2()
    snap.moneyAdjustments = call('bestRound', [{ kind: 'award', toPlayerId: 'p5', amount: 1200 }])
    snap.rounds[1]!.status = 'live'
    const st = run(snap)
    expect(st.money.unassigned.assignments.map((a) => a.status)).toEqual(['waiting'])
    expect(st.prizes.some((p) => p.moduleId === 'adjustment')).toBe(false)
  })
})

describe('every source the rules leave to the Comité is a bucket with a stable key', () => {
  it('Calcutta places nobody fills: «calcutta», refunded to the owners by what they paid', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    twoPutts(snap)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    // Lots never auctioned: no D player was sold, so «Mejor D» has nobody (MONEY-11).
    snap.players.forEach((p, i) => {
      if (p.tier !== 'D') snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000 + 250 * (i % 3), ownerId: p.id, soldAt: '' })
      else snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'pending', price: null, ownerId: null, soldAt: null })
    })
    // One of them open on the block, its player the high bidder at the opening bid: still nobody's money.
    Object.assign(snap.calcuttaLots.find((l) => l.status === 'pending')!, { status: 'open', price: 250, ownerId: snap.calcuttaLots.find((l) => l.status === 'pending')!.playerId })
    const st = run(snap)
    const a = st.modules.auction!
    expect(a.unfilled).toBeGreaterThan(0)
    const bucket = st.money.unassigned.buckets.find((b) => b.key === 'calcutta')!
    expect(bucket).toMatchObject({ label: 'La Calcutta', potId: 'calcutta', amount: a.unfilled })
    expect(bucket.contributors!.reduce((s, c) => s + c.amount, 0)).toBe(a.pot)
    snap.moneyAdjustments = call('calcutta', proRata(bucket.remaining, bucket.contributors!).map((c) => ({ kind: 'refund', toPlayerId: c.playerId, amount: c.amount })))
    const after = run(snap)
    expect(after.money.unassigned.total).toBe(0)
    expect(after.money.banker.balanced).toBe(true)
    // A Calcutta refund counts with his Calcutta money.
    const owner = bucket.contributors![0]!.playerId
    expect(after.money.people[owner]!.calcuttaShares).toBeGreaterThan(st.money.people[owner]!.calcuttaShares)
  })

  function oneRound(games: GameConfig[], players = 4): Snapshot {
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 1, games }
    const snap = makeSnapshot({ settings, players: Array.from({ length: players }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1)] })
    for (let i = 1; i <= players; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]!))
    snap.rounds[0]!.status = 'finished'
    return snap
  }

  it('a pot from the inscriptions nobody won: «game:<id>», refunded to everyone who paid an entry', () => {
    const skins: GameConfig = { id: 'skins', type: 'skins', label: 'Skins', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'gross', carryOver: true }, money: money({ source: 'main', amount: 300 }) }
    const snap = oneRound([skins])
    const settings = { ...(snap.tournament.settings as TournamentSettings), entryFee: 100, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [100] } }
    snap.tournament.settings = settings
    const st = run(snap, settings)
    expect(keyed(st)).toEqual({ 'game:skins': 300 })
    const b = st.money.unassigned.buckets[0]!
    expect(b.why.steps).toContain('Skins: nadie ganó un skin; $300 quedan sin asignar.')
    expect(b.contributors).toEqual(['p1', 'p2', 'p3', 'p4'].map((playerId) => ({ playerId, amount: 100 })))
  })

  it('a contest in dispute on a side pot: «game:<id>», refunded to its entrants', () => {
    const ctp: GameConfig = { id: 'ctp', type: 'contest', label: 'Más cerca', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: 'par3' }, money: money({ source: 'side', buyIn: 100 }) }
    const snap = oneRound([ctp])
    const claims: HoleAward[] = [
      { roundId: 'r1', groupId: 'g1', hole: 3, gameId: 'ctp', playerId: 'p1' },
      { roundId: 'r1', groupId: 'g2', hole: 3, gameId: 'ctp', playerId: 'p3' },
    ]
    snap.holeAwards = claims
    const st = run(snap)
    expect(keyed(st)).toEqual({ 'game:ctp': 400 })
    const b = st.money.unassigned.buckets[0]!
    expect(b.potId).toBe('ctp')
    expect(b.contributors).toEqual(['p1', 'p2', 'p3', 'p4'].map((playerId) => ({ playerId, amount: 100 })))
    expect(b.why.steps).toContain('Más cerca: un hoyo en disputa (3).')
  })

  it('a side pot that is fully won leaves no bucket', () => {
    const low: GameConfig = { id: 'low', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', scope: 'overall' }, money: money({ source: 'side', buyIn: 100 }) }
    const snap = makeSnapshot({ settings: { ...DEFAULT_SETTINGS, rounds: 1, games: [low] }, players: Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1)] })
    // Distinct scores: p1 wins the whole $400.
    for (let i = 1; i <= 4; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]! + (h < i ? 1 : 0)))
    snap.rounds[0]!.status = 'finished'
    const st = run(snap)
    expect(st.games.low!.pot).toBe(400)
    expect(st.prizes.filter((p) => p.gameId === 'low').reduce((s, p) => s + p.amount, 0)).toBe(400)
    expect(keyed(st)).toEqual({})
    expect(st.money.unassigned.total).toBe(0)
  })

  it('a place beyond the field: «individual»', () => {
    const settings: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), rounds: 1, entryFee: 2000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3000, 1500, 1000, 500] } }
    const snap = makeSnapshot({ settings, players: Array.from({ length: 3 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1)] })
    for (let i = 1; i <= 3; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]! + (h <= i ? 1 : 0)))
    snap.rounds[0]!.status = 'finished'
    snap.tournament.status = 'finished'
    const st = run(snap, settings)
    // 3 players paid $6,000; the 3,000 + 1,500 + 1,000 places are filled, the 4th's $500 is nobody's.
    expect(keyed(st)).toEqual({ individual: 500 })
    expect(st.money.unassigned.buckets[0]!.why.steps).toContain('Individual: el 4.º lugar no lo gana nadie (3 jugadores con resultado): $500 sin asignar.')
  })

  it('entries no prize claims: «pool»', () => {
    const settings: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), rounds: 1, entryFee: 1000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [2000, 1000] } }
    const snap = makeSnapshot({ settings, players: Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1)] })
    for (let i = 1; i <= 4; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]! + (h <= i ? 1 : 0)))
    snap.rounds[0]!.status = 'finished'
    const st = run(snap, settings)
    expect(keyed(st)).toEqual({ pool: 1000 })
    expect(st.money.unassigned.buckets[0]!.label).toBe('Inscripciones sin premio')
  })

  it('the keys do not move with what moves inside a bucket', () => {
    const snap = cancelledDay2()
    const before = run(snap).money.unassigned.buckets.map((b) => b.key)
    // A day-1 score corrected, a payment marked: amounts may move, the keys stay.
    snap.scores[0]!.strokes = (snap.scores[0]!.strokes ?? 4) + 1
    snap.payments.push({ id: 'pay1', kind: 'entry', fromPlayerId: 'p2', toPlayerId: null, amount: 2500, paid: true, note: null })
    expect(run(snap).money.unassigned.buckets.map((b) => b.key)).toEqual(before)
  })
})

describe('pro rata: whole pesos, summing exactly, the same every time', () => {
  it('splits by what each put in; the pesos left go to the biggest contributors first', () => {
    const c = [
      { playerId: 'a', amount: 300 },
      { playerId: 'b', amount: 200 },
      { playerId: 'c', amount: 100 },
    ]
    // 500.5, 333.67 and 166.83 floor to 500, 333 and 166: two pesos left, to the largest fractions, c and b.
    expect(proRata(1001, c)).toEqual([
      { playerId: 'a', amount: 500 },
      { playerId: 'b', amount: 334 },
      { playerId: 'c', amount: 167 },
    ])
    // Equal contributors: the list's order breaks the tie.
    expect(proRata(100, [{ playerId: 'x', amount: 1 }, { playerId: 'y', amount: 1 }, { playerId: 'z', amount: 1 }]).map((s) => s.amount)).toEqual([34, 33, 33])
    // 1, 0.67 and 0.33: a takes his peso, the one left goes to b; c gets none and is not listed.
    expect(proRata(2, c)).toEqual([
      { playerId: 'a', amount: 1 },
      { playerId: 'b', amount: 1 },
    ])
    expect(proRata(0, c)).toEqual([])
    expect(proRata(10, [])).toEqual([])
  })

  it('always sums to the amount and never gives anyone a peso more than his share, rounded up', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = 1 + (seed % 9)
      const list = Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, amount: ((seed * 37 + i * 101) % 997) + 1 }))
      const amount = (seed * 7919) % 50000
      const out = proRata(amount, list)
      expect(out.reduce((s, x) => s + x.amount, 0)).toBe(amount)
      const total = list.reduce((s, x) => s + x.amount, 0)
      for (const x of out) expect(x.amount).toBeLessThanOrEqual(Math.ceil((amount * list.find((c) => c.playerId === x.playerId)!.amount) / total))
    }
  })
})

describe('property: assigning every bucket in full empties «Por asignar» and balances the books', () => {
  const scenarios: Array<[string, () => Snapshot]> = [
    ['a cancelled day', cancelledDay2],
    [
      'unfilled Calcutta places and buybacks',
      () => {
        const snap = makeFirstTournament()
        fillRound(snap, 'r1', 5)
        fillRound(snap, 'r2', 6)
        snap.rounds.forEach((r) => (r.status = 'finished'))
        snap.players.forEach((p, i) => {
          if (p.tier === 'D') return
          snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 750 + 250 * (i % 4), ownerId: `p${((i + 3) % 9) + 1}`, soldAt: '' })
        })
        snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 375, paid: false })
        return snap
      },
    ],
    [
      'a cancelled day with an unanswered snake tiebreak, answered after the rest is assigned',
      () => {
        const snap = makeFirstTournament()
        fillRound(snap, 'r1', 7)
        for (const s of snap.scores) if (s.hole === 9 && ['p1', 'p10'].includes(s.playerId)) Object.assign(s, { strokes: Math.max(s.strokes ?? 0, 4), putts: 3 })
        snap.rounds[0]!.status = 'finished'
        snap.rounds[1]!.status = 'cancelled'
        snap.tournament.status = 'finished'
        return snap
      },
    ],
  ]
  it.each(scenarios)('%s', (_name, make) => {
    const snap = make()
    const settings = S
    const st = run(snap, settings)
    expect(st.money.unassigned.buckets.length).toBeGreaterThan(0)
    expect(st.money.unassigned.total + st.money.unassigned.heldTotal).toBe(st.money.banker.difference)
    snap.moneyAdjustments = assignAll(st, snap.players[0]!.id)
    // Held money is the snake's: answering is what pays it (an answer may bring the group's next tie up).
    answerAll(snap, settings)
    const after = run(snap, settings)
    expect(after.money.unassigned.assignments.every((a) => a.status === 'applied')).toBe(true)
    expect(after.flags.warnings.filter((w) => w.startsWith('Asignación'))).toEqual([])
    expectBalanced(after)
    // What the Comité gave out is exactly what was unassigned, house included.
    const given = after.prizes.filter((p) => p.moduleId === 'adjustment').reduce((s, p) => s + p.amount, 0) + after.money.banker.toHouse
    expect(given).toBe(st.money.unassigned.total)
  })
})

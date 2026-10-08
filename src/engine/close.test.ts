/**
 * «Cerrar torneo» (MONEY-05): Terminado and publishing wait for what would
 * otherwise freeze wrong: an open day, an unanswered tiebreak, an unsold lot,
 * money «por asignar», an assignment that cannot be paid, an unsigned card
 * of a finished round, a refused write nobody saw. What people still owe is
 * a warning only: collecting after the trip is normal.
 */
import { describe, expect, it } from 'vitest'
import { closeCheck } from './close'
import { computeTournament } from './computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import type { TournamentSettings } from './settings/schema'
import { fillRound, makeFirstTournament, makePlayer, makeRound, makeSnapshot, PAR_72, score } from './testing/fixtures'
import type { Snapshot } from './types'

const S = FIRST_TOURNAMENT_SETTINGS
const PARS = PAR_72.map(([p]) => p)

/** Both days played, every card signed, every putt a two-putt, every entry paid: nothing left to settle. */
function clean(): Snapshot {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 1)
  fillRound(snap, 'r2', 2)
  snap.scores.forEach((s) => (s.putts = Math.min(2, s.strokes ?? 2)))
  snap.rounds.forEach((r) => (r.status = 'finished'))
  for (const r of snap.rounds) for (const p of snap.pairs) snap.cardSignatures.push({ roundId: r.id, pairId: p.id, signedBy: p.player1Id, signedAt: '' })
  for (const p of snap.players) snap.payments.push({ id: `pay-${p.id}`, kind: 'entry', fromPlayerId: p.id, toPlayerId: null, amount: 2500, paid: true, note: null })
  return snap
}
const kinds = (snap: Snapshot, opts: Partial<Parameters<typeof closeCheck>[2]> = {}, settings: TournamentSettings = S) => closeCheck(snap, settings, { openRejected: 0, ...opts }).blockers.map((b) => b.kind)

describe('«Cerrar torneo»', () => {
  it('a clean tournament closes', () => {
    const c = closeCheck(clean(), S, { openRejected: 0 })
    expect(c).toEqual({ blockers: [], warnings: [], ok: true })
  })

  it('a day still open blocks, and says where to close it', () => {
    const snap = clean()
    snap.rounds[1]!.status = 'live'
    const c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.ok).toBe(false)
    expect(c.blockers).toEqual([{ kind: 'openRounds', text: 'El día 2 sigue abierto: termínalo o cancélalo en Comité, sección Rondas.' }])
  })

  it('a cancelled day leaves its prizes «por asignar»: blocked until the Comité assigns them', () => {
    const snap = clean()
    snap.rounds[1]!.status = 'cancelled'
    snap.scores = snap.scores.filter((s) => s.roundId !== 'r2')
    let c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.blockers).toEqual([{ kind: 'unassigned', text: '$3,000 por asignar: el Comité decide en Dinero, Liquidación.' }])
    snap.moneyAdjustments = [
      { id: 'a1', sourceKey: 'bestRound', kind: 'house', toPlayerId: null, amount: 1200, reason: 'Para la cena', createdAt: '2027-04-12T09:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null },
      { id: 'a2', sourceKey: 'snake', kind: 'award', toPlayerId: 'p1', amount: 1900, reason: 'Se pasó', createdAt: '2027-04-12T09:01:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null },
    ]
    // The snake's $1,800 cannot take $1,900: still unassigned, and the assignment flagged.
    c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.blockers.map((b) => b.kind)).toEqual(['unassigned', 'badAssignments'])
    expect(c.blockers[1]!.text).toBe('Una asignación no se puede pagar: anúlalas en Dinero, Liquidación.')
    snap.moneyAdjustments[1] = { ...snap.moneyAdjustments[1]!, voidedAt: '2027-04-12T09:02:00+00:00', voidReason: 'Error' }
    snap.moneyAdjustments.push({ id: 'a3', sourceKey: 'snake', kind: 'award', toPlayerId: 'p1', amount: 1800, reason: 'Ahora sí', createdAt: '2027-04-12T09:03:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null })
    expect(closeCheck(snap, S, { openRejected: 0 }).ok).toBe(true)
  })

  it('an unanswered snake tiebreak blocks (and holds its group’s money)', () => {
    const snap = clean()
    for (const s of snap.scores) if (s.roundId === 'r2' && s.hole === 18 && (s.playerId === 'p1' || s.playerId === 'p10')) Object.assign(s, { strokes: Math.max(s.strokes ?? 0, 4), putts: 3 })
    expect(kinds(snap)).toEqual(['tiebreaks', 'unassigned'])
    expect(closeCheck(snap, S, { openRejected: 0 }).blockers[0]!.text).toBe('Un desempate de la víbora sin responder («¿Quién embocó al último?»): en Comité, sección Tarjetas.')
    snap.snakeTiebreaks.push({ roundId: 'r2', groupId: 'r2g1', hole: 18, lastHoledPlayerId: 'p1' })
    expect(kinds(snap)).toEqual([])
  })

  it('a lot never auctioned blocks, by name', () => {
    const snap = clean()
    snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i}`, playerId: p.id, lotNumber: i + 1, status: i === 0 ? 'pending' : 'sold', price: i === 0 ? null : 500, ownerId: i === 0 ? null : p.id, soldAt: null }))
    for (const p of snap.players.slice(1)) snap.payments.push({ id: `cal-${p.id}`, kind: 'calcutta', fromPlayerId: p.id, toPlayerId: null, amount: 500, paid: true, note: null })
    const c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.blockers.find((b) => b.kind === 'unsoldLots')!.text).toBe('Lotes de la Calcutta sin vender: J1. Véndelos en Comité, sección Calcutta.')
  })

  it('an unsigned card of a finished round blocks', () => {
    const snap = clean()
    snap.cardSignatures = snap.cardSignatures.filter((s) => !(s.roundId === 'r2' && s.pairId === 'pair1'))
    expect(kinds(snap)).toEqual(['unsignedCards'])
  })

  it('a refused write nobody reviewed blocks', () => {
    expect(kinds(clean(), { openRejected: 2 })).toEqual(['rejectedWrites'])
  })

  it('what people still owe is a warning, never a blocker', () => {
    const snap = clean()
    snap.payments = snap.payments.filter((p) => p.fromPlayerId !== 'p3' && p.fromPlayerId !== 'p4')
    const c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.ok).toBe(true)
    expect(c.warnings).toEqual(['2 personas todavía deben $5,000. No impide cerrar: se puede cobrar después en Dinero.'])
  })

  it('a Ronda rápida closes its live round itself: the open day does not block, its unassigned pot does', () => {
    const settings: TournamentSettings = {
      ...structuredClone(DEFAULT_SETTINGS),
      rounds: 1,
      games: [{ id: 'skins', type: 'skins', label: 'Skins', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'gross', carryOver: true }, money: { source: 'main', amount: 300, buyIn: 0, stake: 0, split: [100] } }],
      entryFee: 100,
      prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [100] },
    }
    const snap = makeSnapshot({ settings, players: Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'live' })] })
    for (let i = 1; i <= 4; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]!))
    for (const p of snap.players) snap.payments.push({ id: `pay-${p.id}`, kind: 'entry', fromPlayerId: p.id, toPlayerId: null, amount: 100, paid: true, note: null })
    // Live, nothing is listed yet; the check reads it as it will be once closed.
    expect(computeTournament(snap, settings).money.unassigned.buckets).toEqual([])
    expect(kinds(snap, {}, settings)).toEqual(['openRounds', 'unassigned'])
    expect(kinds(snap, { finishLiveRounds: true }, settings)).toEqual(['unassigned'])
  })
})

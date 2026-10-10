/**
 * «Cerrar torneo» (MONEY-05): Terminado and publishing wait for what would
 * otherwise freeze wrong: a day not created or still open, an unanswered
 * tiebreak, money «por asignar», an assignment that cannot be paid, an
 * unsigned card of a finished round. What people still owe, a lot never
 * auctioned and a refused write nobody can clear yet are warnings only. The
 * gate reads the same «play is over» flag as Dinero, so it never blocks on a
 * list Dinero does not show.
 */
import { describe, expect, it } from 'vitest'
import { closeCheck } from './close'
import { computeTournament } from './computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import type { TournamentSettings } from './settings/schema'
import { fillRound, makeFirstTournament, makePlayer, makeRound, makeSnapshot, PAR_72, score } from './testing/fixtures'
import type { Snapshot } from './types'
import { t } from '../i18n/es-MX'

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
      { id: 'a1', callId: 'call-a1', sourceKey: 'bestRound', kind: 'house', toPlayerId: null, amount: 1200, reason: 'Para la cena', createdAt: '2027-04-12T09:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null },
      { id: 'a2', callId: 'call-a2', sourceKey: 'snake', kind: 'award', toPlayerId: 'p1', amount: 1900, reason: 'Se pasó', createdAt: '2027-04-12T09:01:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null },
    ]
    // The snake's $1,800 cannot take $1,900: still unassigned, and the assignment flagged.
    c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.blockers.map((b) => b.kind)).toEqual(['unassigned', 'badAssignments'])
    expect(c.blockers[1]!.text).toBe('Una asignación no se puede pagar: anúlalas en Dinero, Liquidación.')
    snap.moneyAdjustments[1] = { ...snap.moneyAdjustments[1]!, voidedAt: '2027-04-12T09:02:00+00:00', voidReason: 'Error' }
    snap.moneyAdjustments.push({ id: 'a3', callId: 'call-a3', sourceKey: 'snake', kind: 'award', toPlayerId: 'p1', amount: 1800, reason: 'Ahora sí', createdAt: '2027-04-12T09:03:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null })
    expect(closeCheck(snap, S, { openRejected: 0 }).ok).toBe(true)
  })

  it('an unanswered snake tiebreak blocks (and holds its group’s money)', () => {
    const snap = clean()
    for (const s of snap.scores) if (s.roundId === 'r2' && s.hole === 18 && (s.playerId === 'p1' || s.playerId === 'p10')) Object.assign(s, { strokes: Math.max(s.strokes ?? 0, 4), putts: 3 })
    // Its group's money waits for the answer: not «por asignar», so the tiebreak is the only thing to do.
    expect(kinds(snap)).toEqual(['tiebreaks'])
    expect(closeCheck(snap, S, { openRejected: 0 }).blockers[0]!.text).toBe('Un desempate de la víbora sin responder («¿Quién embocó al último?»): en Comité, sección Tarjetas.')
    snap.snakeTiebreaks.push({ roundId: 'r2', groupId: 'r2g1', hole: 18, lastHoledPlayerId: 'p1' })
    expect(kinds(snap)).toEqual([])
  })

  it('a lot never auctioned warns, by name, and does not block: it cashes nothing (MONEY-11)', () => {
    const snap = clean()
    snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i}`, playerId: p.id, lotNumber: i + 1, status: i === 0 ? 'pending' : 'sold', price: i === 0 ? null : 500, ownerId: i === 0 ? null : p.id, soldAt: null }))
    for (const p of snap.players.slice(1)) snap.payments.push({ id: `cal-${p.id}`, kind: 'calcutta', fromPlayerId: p.id, toPlayerId: null, amount: 500, paid: true, note: null })
    const c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.warnings).toContain('Lotes de la Calcutta sin vender: J1. No cobran nada de la Calcutta; si deben contar, véndelos en Comité, sección Calcutta.')
    // Whatever slot it leaves empty is the Calcutta's «por asignar», decided in Dinero like any other.
    expect(c.blockers.map((b) => b.kind).filter((k) => k !== 'unassigned')).toEqual([])
  })

  it('an unsigned card of a finished round blocks', () => {
    const snap = clean()
    snap.cardSignatures = snap.cardSignatures.filter((s) => !(s.roundId === 'r2' && s.pairId === 'pair1'))
    expect(kinds(snap)).toEqual(['unsignedCards'])
  })

  it('a hole the server kept for the Comité holds the close until «Pendientes de revisar» resolves it (REL-08)', () => {
    const c = closeCheck(clean(), S, { openRejected: 2 })
    expect(c.ok).toBe(false)
    expect(c.blockers).toEqual([{ kind: 'rejectedWrites', text: '2 hoyos que el servidor no tomó siguen sin revisar: aplícalos o descártalos en Comité, sección Tarjetas, «Pendientes de revisar».' }])
    expect(c.warnings).toEqual([])
    expect(closeCheck(clean(), S, { openRejected: 1 }).blockers[0]!.text).toBe('Un hoyo que el servidor no tomó sigue sin revisar: aplícalo o descártalo en Comité, sección Tarjetas, «Pendientes de revisar».')
    expect(closeCheck(clean(), S, { openRejected: 0 }).ok).toBe(true)
  })

  it('a server without «Pendientes de revisar» yet (0028 not applied) does not hold the close: it says the list is not there', () => {
    const c = closeCheck(clean(), S, { openRejected: null })
    expect(c.ok).toBe(true)
    expect(c.blockers).toEqual([])
    expect(c.warnings).toEqual([t.closeGate.rejectedUnavailable])
  })

  it('every day rained out: Dinero lists the money the gate blocks on, and once assigned it closes', () => {
    const settings: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), rounds: 1, entryFee: 1000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [2500, 1500] } }
    const snap = makeSnapshot({ settings, players: 4, rounds: 1 })
    snap.rounds[0]!.status = 'cancelled'
    const dinero = computeTournament(snap, settings).money.unassigned
    expect(dinero.closing).toBe(true)
    expect(dinero.buckets.map((b) => [b.key, b.remaining])).toEqual([['individual', 4000]])
    expect(kinds(snap, {}, settings)).toEqual(['unassigned'])
    snap.moneyAdjustments = [{ id: 'x1', callId: 'cx', sourceKey: 'individual', kind: 'house', toPlayerId: null, amount: 4000, reason: 'Llovió', createdAt: '2027-04-12T09:00:00+00:00', createdBy: 'org', voidedAt: null, voidReason: null }]
    expect(closeCheck(snap, settings, { openRejected: 0 }).ok).toBe(true)
  })

  it('a day not created yet: nothing is «por asignar» in Dinero or in the gate, and the gate says to create it', () => {
    const snap = clean()
    snap.rounds = [snap.rounds[0]!]
    snap.groups = snap.groups.filter((g) => g.roundId === 'r1')
    snap.scores = snap.scores.filter((x) => x.roundId === 'r1')
    snap.cardSignatures = snap.cardSignatures.filter((x) => x.roundId === 'r1')
    expect(computeTournament(snap, S).money.unassigned.closing).toBe(false)
    const c = closeCheck(snap, S, { openRejected: 0 })
    expect(c.blockers).toEqual([
      { kind: 'missingRounds', text: 'El día 2 no está creado: créalo y juégalo o cancélalo en Comité, sección Rondas, o baja el número de rondas en Comité, sección Torneo.' },
    ])
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
    // Without finishing it, play is not over: the open day blocks, and nothing is «por asignar» yet (as in Dinero).
    expect(kinds(snap, {}, settings)).toEqual(['openRounds'])
    expect(kinds(snap, { finishLiveRounds: true }, settings)).toEqual(['unassigned'])
  })
})

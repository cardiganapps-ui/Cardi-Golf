import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { assertPrizePool } from '../settings/prizeCheck'
import { FIRST_TOURNAMENT_PLAYER_COUNT, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { fillRound, makeFirstTournament } from '../testing/fixtures'

const S = FIRST_TOURNAMENT_SETTINGS

describe('Money', () => {
  it('prize settings must sum to $30,000', () => {
    expect(assertPrizePool(S, { players: FIRST_TOURNAMENT_PLAYER_COUNT }).prizesTotal).toBe(30000)
  })

  it('a finished first tournament with a Calcutta nets to zero across all people, banker included', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 11)
    fillRound(snap, 'r2', 12)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    // Calcutta: everyone bought by the next player, with a 50% buyback on lot 1.
    snap.players.forEach((p, i) => {
      const owner = snap.players[(i + 1) % 12]!.id
      snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 250 + 250 * (i % 4), ownerId: owner, soldAt: '' })
    })
    snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 125, paid: false })

    // Answer every "¿Quién embocó al último?" the seed produced (otherwise the pot would not close).
    // Each answer can reveal the next question in that group, so loop.
    for (let i = 0; i < 20; i++) {
      const pending = computeTournament(snap, S).flags.pendingSnakeTiebreaks
      if (!pending.length) break
      for (const q of pending) {
        snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
      }
    }
    const st = computeTournament(snap, S)
    expect(st.flags.pendingSnakeTiebreaks).toEqual([])
    const prizeTotal = st.prizes.filter((p) => p.moduleId !== 'auction').reduce((s, p) => s + p.amount, 0)
    expect(prizeTotal).toBe(30000)
    const m = st.money
    expect(m.banker.receives).toBe(30000 + st.modules.auction!.pot)
    expect(m.banker.pays).toBe(30000 + st.modules.auction!.pot)
    expect(m.banker.balanced).toBe(true)
    expect(m.netSum).toBe(0)
    // Per person: paid = entry + purchases + buybacks paid; receives = prizes + shares + buybacks received.
    const p1 = m.people.p1!
    expect(p1.entry).toBe(2500)
    expect(p1.calcuttaPurchases).toBe(snap.calcuttaLots.find((l) => l.ownerId === 'p1')!.price)
    expect(p1.buybacksPaid).toBe(125)
    expect(m.people.p2!.buybacksReceived).toBe(125)
    expect(p1.net).toBe(p1.receives - p1.paid)
    // Settlement via bank: bank transfers net to the bank's own difference (0) and peer-to-peer nets to zero.
    const bankIn = m.viaBank.filter((t) => t.to === null).reduce((s, t) => s + t.amount, 0)
    const bankOut = m.viaBank.filter((t) => t.from === null).reduce((s, t) => s + t.amount, 0)
    expect(bankIn - bankOut).toBe(0)
    const p2pNet: Record<string, number> = {}
    for (const t of m.peerToPeer) {
      p2pNet[t.from!] = (p2pNet[t.from!] ?? 0) - t.amount
      p2pNet[t.to!] = (p2pNet[t.to!] ?? 0) + t.amount
    }
    for (const person of Object.values(m.people)) expect(p2pNet[person.playerId] ?? 0).toBe(person.net)
  })

  it('marks flows paid from payments rows', () => {
    const snap = makeFirstTournament()
    snap.payments.push({ id: 'pay1', fromPlayerId: 'p1', toPlayerId: null, amount: 2500, kind: 'entry', paid: true, note: null })
    const st = computeTournament(snap, S)
    expect(st.money.flows.find((f) => f.kind === 'entry' && f.from === 'p1')!.paid).toBe(true)
    expect(st.money.flows.find((f) => f.kind === 'entry' && f.from === 'p2')!.paid).toBe(false)
  })

  it('live mode shows the bank mismatch while prizes are still open', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 5)
    const st = computeTournament(snap, S)
    expect(st.money.banker.balanced).toBe(false)
    expect(st.money.banker.difference).toBeGreaterThan(0)
  })
})

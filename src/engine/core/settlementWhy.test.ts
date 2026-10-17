/**
 * MONEY-07: the numbers people pay by explain themselves. Each vía-banco line
 * lists every flow still due on the accounts it closes, signed from the
 * payer's side, and they add up to the line; each sin-banco transfer shows
 * both parties' positions, whose parts add up to them, and the share of the
 * payer's debt it carries; the bank says what comes in and goes out.
 *
 * The expected parts are worked out from what each test builds, not read
 * back from the engine's accounts.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'
import { DEFAULT_SETTINGS } from '../settings/presets'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { makeSnapshot } from '../testing/fixtures'
import type { PrizeAward } from '../modules/module'
import type { AuctionState } from '../modules/auction'
import type { Id, PaymentKind, Snapshot } from '../types'
import { computeMoney, type MoneyPart, type MoneyState } from './money'
import { t } from '../../i18n/es-MX'
import { words } from '../testing/words'
import { label, type Explanation } from '../messages'

const W = t.settleWhy
const why: Explanation = { title: label(''), steps: [] }
const sum = (xs: Array<{ amount: number }>) => xs.reduce((s, x) => s + x.amount, 0)

function prize(
  playerId: Id,
  amount: number,
  opts: Partial<Omit<PrizeAward, 'label'>> & { label?: string } = {},
): PrizeAward {
  return {
    moduleId: 'individual',
    playerId,
    amount,
    final: true,
    why,
    ...opts,
    label: label(opts.label ?? 'Individual, 1.º'),
  }
}
/** A line's or a position's parts as Dinero says them (ARCH-05). */
const said = (parts: MoneyPart[] | undefined) => parts?.map((x) => ({ ...x, label: words(x.label) }))
function pay(snap: Snapshot, kind: PaymentKind, from: Id | null, to: Id | null, amount: number) {
  snap.payments.push({
    id: `pay${snap.payments.length + 1}`,
    kind,
    fromPlayerId: from,
    toPlayerId: to,
    amount,
    paid: true,
    note: null,
  })
}
function fourPlayers(over: Partial<TournamentSettings> = {}, banker: Id | null = null) {
  const s = { ...DEFAULT_SETTINGS, entryFee: 1000, ...over }
  const snap = makeSnapshot({ players: 4, rounds: 1, settings: s })
  snap.tournament.bankerPlayerId = banker
  return { s, snap }
}
const money = (snap: Snapshot, s: TournamentSettings, prizes: PrizeAward[], auction?: AuctionState): MoneyState =>
  computeMoney(snap, s, prizes, auction, true)

/** Every invariant MONEY-07 promises, on one money state. */
function explained(m: MoneyState) {
  for (const tr of m.viaBank) {
    expect(tr.parts, 'a vía-banco line has its parts').toBeDefined()
    expect(sum(tr.parts!), 'its parts add up to the line').toBe(tr.amount)
    expect(tr.why).toHaveLength(1)
    expect(words(tr.why)[0]!.steps.length).toBeGreaterThan(1)
    expect(words(tr.why)[0]!.steps.at(-1)).toBe(
      tr.amount === 0 ? W.nets : W.total(`$${tr.amount.toLocaleString('en-US')}`),
    )
  }
  for (const p of m.positions) expect(sum(p.parts), 'a position is the sum of its parts').toBe(p.amount)
  const at = new Map(m.positions.map((p) => [p.party, p.amount]))
  const moved = new Map<Id | null, number>()
  for (const tr of m.peerToPeer) {
    expect(tr.why, 'payer, receiver and the share').toHaveLength(3)
    expect(at.get(tr.from)!).toBeLessThan(0)
    expect(at.get(tr.to)!).toBeGreaterThan(0)
    moved.set(tr.from, (moved.get(tr.from) ?? 0) - tr.amount)
    moved.set(tr.to, (moved.get(tr.to) ?? 0) + tr.amount)
  }
  // Sin banco pays each position out exactly (when it is shown at all).
  if (m.peerToPeer.length)
    for (const p of m.positions) expect(moved.get(p.party) ?? 0, `position of ${p.party}`).toBe(p.amount)
  expect(words(m.banker.why).steps).toContain(W.bankInTotal(`$${m.banker.receives.toLocaleString('en-US')}`))
  expect(words(m.banker.why).steps).toContain(W.bankOutTotal(`$${m.banker.pays.toLocaleString('en-US')}`))
}

describe('every settlement line says where its amount comes from (MONEY-07)', () => {
  it('a winner who has not paid: his prize, less his entry, adds up to the line', () => {
    const { s, snap } = fourPlayers()
    const m = money(snap, s, [
      prize('p1', 3000),
      prize('p1', 1000, { moduleId: 'bestRound', label: 'Mejor ronda, día 1' }),
    ])
    const line = m.viaBank.find((x) => x.to === 'p1')!
    expect(line.amount).toBe(3000)
    expect(said(line.parts)).toEqual([
      { label: 'Individual, 1.º', amount: 3000 },
      { label: 'Mejor ronda, día 1', amount: 1000 },
      { label: 'Inscripción', amount: -1000 },
    ])
    expect(words(line.why)[0]!.steps).toEqual([
      'Individual, 1.º: +$3,000',
      'Mejor ronda, día 1: +$1,000',
      'Inscripción: −$1,000',
      'Total: $3,000',
    ])
    explained(m)
  })

  it('what was already paid is not in the line; a flow half paid shows what is left of it', () => {
    const { s, snap } = fourPlayers()
    pay(snap, 'entry', 'p2', null, 400)
    const m = money(snap, s, [prize('p1', 4000)])
    const p2 = m.viaBank.find((x) => x.from === 'p2')!
    expect(p2.amount).toBe(600)
    expect(said(p2.parts)).toEqual([{ label: 'Inscripción', amount: 600, of: 1000 }])
    expect(words(p2.why)[0]!.steps[0]).toBe('Inscripción: +$600 (de $1,000; lo demás ya se pagó)')
    explained(m)
  })

  it('an account paid beyond what it owes is given back, and the line says so', () => {
    const { s, snap } = fourPlayers()
    pay(snap, 'entry', 'p3', null, 1500)
    const m = money(snap, s, [prize('p1', 4000)])
    const p3 = m.viaBank.find((x) => x.to === 'p3')!
    expect([p3.from, p3.amount]).toEqual([null, 500])
    expect(said(p3.parts)).toEqual([{ label: W.overpaid('Inscripción'), amount: 500 }])
    explained(m)
  })

  it('a line whose debts and prizes cancel out says nothing changes hands', () => {
    const { s, snap } = fourPlayers()
    const m = money(snap, s, [prize('p1', 1000), prize('p2', 3000, { label: 'Individual, 2.º' })])
    const square = m.viaBank.find((x) => x.from === 'p1')!
    expect(square.amount).toBe(0)
    expect(said(square.parts)).toEqual([
      { label: 'Inscripción', amount: 1000 },
      { label: 'Individual, 1.º', amount: -1000 },
    ])
    expect(words(square.why)[0]!.steps.at(-1)).toBe(W.nets)
    explained(m)
  })

  it('a buyback and a net of bets each explain themselves from the payer’s side', () => {
    const s = { ...DEFAULT_SETTINGS, entryFee: 0 }
    const snap = makeSnapshot({ players: 2, rounds: 1, settings: s })
    snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 500, paid: false })
    const auction = {
      lots: [
        {
          lotId: 'lot1',
          playerId: 'p1',
          lotNumber: 1,
          status: 'sold',
          price: 1000,
          ownerId: 'p2',
          buybackPct: 50,
          buybackAmount: 500,
        },
      ],
    } as unknown as AuctionState
    const bets = [
      prize('p2', 300, { payerId: 'p1', gameId: 'g1', label: 'Nassau, frente' }),
      prize('p1', 100, { payerId: 'p2', gameId: 'g1', label: 'Nassau, vuelta' }),
    ]
    const m = money(snap, s, bets, auction)
    const buyback = m.viaBank.find((x) => x.settles?.some((a) => a.kind === 'buyback'))!
    expect([buyback.from, buyback.to, said(buyback.parts)]).toEqual([
      'p1',
      'p2',
      [{ label: 'Recompra 50%', amount: 500 }],
    ])
    const bet = m.viaBank.find((x) => x.settles?.some((a) => a.kind === 'bet'))!
    expect([bet.from, bet.to, bet.amount]).toEqual(['p1', 'p2', 200])
    expect(said(bet.parts)).toEqual([
      { label: 'Nassau, frente', amount: 300 },
      { label: 'Nassau, vuelta', amount: -100 },
    ])
    explained(m)
  })
})

describe('sin banco: each transfer comes from two positions (MONEY-07)', () => {
  it('with no banker the bank is a party; every position is the sum of its parts and is paid out exactly', () => {
    const { s, snap } = fourPlayers()
    pay(snap, 'entry', 'p2', null, 1000)
    const m = money(snap, s, [prize('p1', 2500), prize('p2', 1500, { label: 'Individual, 2.º' })])
    const bank = m.positions.find((p) => p.party === null)!
    // Still to collect: p1, p3, p4's entries ($3,000); still to pay: both prizes ($4,000).
    expect(said(bank.parts)).toEqual([
      { label: W.bankCollects, amount: 3000 },
      { label: W.bankPays, amount: -4000 },
    ])
    const p3 = m.peerToPeer.find((x) => x.from === 'p3')!
    expect(words(p3.why)[0]).toEqual({ title: W.owesTotal('J3', '$1,000'), steps: ['Inscripción: −$1,000'] })
    expect(words(p3.why)[2]!.steps[1]).toBe(
      W.share(
        'J3',
        '$1,000',
        `$${p3.amount.toLocaleString('en-US')}`,
        p3.to === null ? t.moneyScreen.bank : snap.players.find((p) => p.id === p3.to)!.displayName,
      ),
    )
    explained(m)
  })

  it('a banker carries the bank in two parts beside his own', () => {
    const { s, snap } = fourPlayers({}, 'p4')
    const m = money(snap, s, [prize('p1', 4000)])
    const banker = m.positions.find((p) => p.party === 'p4')!
    expect(said(banker.parts)).toEqual([
      { label: 'Inscripción', amount: -1000 },
      { label: W.bankCollects, amount: 4000 },
      { label: W.bankPays, amount: -4000 },
    ])
    expect(m.positions.some((p) => p.party === null)).toBe(false)
    explained(m)
  })
})

describe('the bank says what moves its two figures (MONEY-07)', () => {
  it('in by entries and lots, out by pot, the house cut, and what is left', () => {
    const { s, snap } = fourPlayers({ houseCut: 400 })
    const auction = {
      lots: [
        {
          lotId: 'lot1',
          playerId: 'p1',
          lotNumber: 1,
          status: 'sold',
          price: 800,
          ownerId: 'p2',
          buybackPct: 0,
          buybackAmount: 0,
        },
      ],
    } as unknown as AuctionState
    const m = money(
      snap,
      s,
      [prize('p1', 3000), prize('p2', 800, { moduleId: 'auction', potId: 'calcutta', label: 'Calcutta, campeón' })],
      auction,
    )
    expect(words(m.banker.why).steps).toEqual([
      W.gross,
      W.bankIn(W.entries(4, '$1,000'), '$4,000'),
      W.bankIn(W.lots(1), '$800'),
      W.bankInTotal('$4,800'),
      W.bankOut(W.mainPrizes, '$3,000'),
      W.bankOut(W.calcuttaShares, '$800'),
      W.bankOutTotal('$3,800'),
      W.houseCut('$400'),
      W.left('$600'),
    ])
  })
})

describe('on every fixture, every line, position and transfer explains itself (MONEY-07)', () => {
  for (const name of FIXTURE_NAMES) {
    it(name, () => {
      const fx = getFixture(name)!
      explained(computeTournament(fx.snapshot, parseSettings(fx.snapshot.tournament.settings)).money)
    })
  }
})

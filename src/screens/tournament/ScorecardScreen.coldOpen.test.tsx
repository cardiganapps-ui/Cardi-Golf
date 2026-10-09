// @vitest-environment happy-dom
/**
 * NEW-11 on the real outbox (fake IndexedDB) and the real Tarjeta: the phone
 * opens from its saved boards, and the queue it kept is read before, during or
 * after the card's first render. However the two reads land, a «Guardar» must
 * never write a default (par, 2 putts, no pick-up) over a hole that waits in
 * the queue with what was typed offline.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
const admin = vi.hoisted(() => ({ saves: [] as Array<{ row: Record<string, unknown>; reason: string }> }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  adminSaveScore: vi.fn(async (row: Record<string, unknown>, reason: string) => void admin.saves.push({ row, reason })),
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../components/ui')>()), toast: vi.fn() }))

import { _outboxTest, applyFields, baseRow, enqueueScore, startOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card
const PIDS = ['p1', 'p2', 'p3', 'p4']
let clock = 0

const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

let base: Snapshot
const fx = () => getFixture('minimal4-live')!

/** The phone's saved boards: the server's rows only (what the cache keeps). */
function seedBoards(s: Snapshot) {
  useTournament.setState({ tournamentId: s.tournament.id, data: dataFromSnapshot(structuredClone(s)), loading: false, error: null, realtime: 'off' })
}
/** What Tarjeta's save writes through: the outbox overlays it, as the store's compute does. */
const refresh = () => useTournament.getState().refresh()

function mount(opts: { isAdmin?: boolean } = {}) {
  const f = fx()
  const me = { ...f.me, isAdmin: opts.isAdmin ?? false }
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: base.tournament.id, slug: '_/minimal4-live', lookup: f.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

const holeOnScreen = () => Number(document.querySelector('[class*="holeNum"]')?.textContent)
const nameOf = (pid: string) => base.players.find((p) => p.id === pid)!.displayName
const strokesUp = (pid: string) => screen.getByRole('button', { name: `${S.strokesOf(nameOf(pid))}: ${t.common.stepUp}` })
const saveButton = () => screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast})$`) })
async function tapSave(at: number) {
  clock = at
  await act(async () => {
    fireEvent.click(saveButton())
  })
  await act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
  })
}
/** What the queue holds for a hole now: player → strokes/putts/pickup, each write over the one before it. */
function queuedAt(hole: number): Record<string, string> {
  const rows: Record<string, { strokes: number | null; putts: number | null; picked_up: boolean }> = {}
  for (const it of _outboxTest.queue()) {
    if (it.kind === 'score' && it.payload.hole === hole) rows[it.payload.player_id] = it.payload
    if (it.kind === 'hole' && it.payload.hole === hole) {
      for (const e of it.payload.entries) rows[e.player_id] = applyFields(rows[e.player_id] ?? baseRow(e.base), e.fields)
    }
  }
  return Object.fromEntries(Object.entries(rows).map(([pid, p]) => [pid, `${p.strokes}/${p.putts}${p.picked_up ? '/L' : ''}`]))
}
/** The phone restarts: the queue in memory is gone, IndexedDB keeps it. */
function coldRestart() {
  _outboxTest.reset()
}
async function readQueue() {
  await act(async () => {
    await _outboxTest.load()
  })
}

/** Before the restart, offline: hole `hole` saved for all four with what was typed. */
async function queueHole(hole: number, values: Record<string, { strokes: number | null; putts: number; pickedUp?: boolean }>) {
  seedBoards(base)
  for (const pid of Object.keys(values)) {
    const v = values[pid]!
    await enqueueScore(base.tournament.id, { round_id: 'r1', player_id: pid, hole, strokes: v.pickedUp ? null : v.strokes, putts: v.putts, picked_up: !!v.pickedUp, entered_by: 'p1', client_ts: new Date(Date.UTC(2027, 4, 15, 15, hole)).toISOString() })
  }
}
const TYPED = { p1: { strokes: 7, putts: 3 }, p2: { strokes: 6, putts: 1 }, p3: { strokes: null, putts: 2, pickedUp: true }, p4: { strokes: 3, putts: 0 } }
const TYPED_Q = { p1: '7/3', p2: '6/1', p3: 'null/2/L', p4: '3/0' }

beforeAll(async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  await startOutbox()
})
beforeEach(async () => {
  localStorage.clear()
  admin.saves = []
  _outboxTest.reset()
  await _outboxTest.clearStored()
  clock = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  base = structuredClone(fx().snapshot)
  // p1–p4 through hole 9 on the server, as the phone's copy has them.
  base.scores = base.scores.filter((x) => !(x.roundId === 'r1' && x.hole >= 10))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NEW-11: a cold open with hole 10 queued, then «Guardar»', () => {
  it('queue read before the boards go up', async () => {
    await queueHole(10, TYPED)
    coldRestart()
    await readQueue()
    seedBoards(base)
    mount()
    expect(holeOnScreen()).toBe(11)
    await tapSave(20_000)
    expect(queuedAt(10)).toEqual(TYPED_Q)
  })

  it('queue read after the boards, before the first render', async () => {
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    await readQueue()
    mount()
    expect(holeOnScreen()).toBe(11)
    await tapSave(20_000)
    expect(queuedAt(10)).toEqual(TYPED_Q)
  })

  it('queue read after the first render (the race)', async () => {
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    mount()
    expect(holeOnScreen()).toBe(10)
    await readQueue()
    await tapSave(20_000)
    expect(queuedAt(10)).toEqual(TYPED_Q)
  })

  it('«Guardar» tapped before the queue is read: defaults over the typed hole?', async () => {
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    mount()
    expect(holeOnScreen()).toBe(10)
    await tapSave(20_000)
    await readQueue()
    // What the queue says for hole 10 now.
    expect(queuedAt(10)).toEqual(TYPED_Q)
  })

  it('one player touched before the queue is read: only his row may change', async () => {
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    mount()
    fireEvent.click(strokesUp('p2'))
    await readQueue()
    expect(holeOnScreen()).toBe(10)
    await tapSave(20_000)
    const q = queuedAt(10)
    expect({ p1: q.p1, p3: q.p3, p4: q.p4 }).toEqual({ p1: '7/3', p3: 'null/2/L', p4: '3/0' })
    // p2 was typed offline as 6 strokes and 1 putt; touched here before the read, the card kept what was on
    // screen (par+1, the default 2 putts), and that is what «Guardar» writes: the value the player saw (R4, P3).
    expect(q.p2).toBe('5/2')
  })

  it('a kept draft (PWA-05) on the queued hole survives the race', async () => {
    await queueHole(10, TYPED)
    // Before the restart: back on hole 10, p1 corrected to 8 and the app was killed before saving.
    const kept = { at: Date.now(), players: { p1: { draft: { strokes: 8, putts: 3, pickedUp: false }, server: '7:3:false' } } }
    const key = 'cardi-golf:tarjeta:r1|r1g1|10'
    localStorage.setItem(key, JSON.stringify(kept))
    coldRestart()
    seedBoards(base)
    mount()
    await readQueue()
    // Wherever the card is now, go to 11 and back to 10: the correction should come back.
    if (holeOnScreen() === 10) fireEvent.click(screen.getByRole('button', { name: new RegExp(S.next) }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(S.prev) }))
    expect(holeOnScreen()).toBe(10)
    expect(localStorage.getItem(key), 'the kept correction is still on the phone').not.toBeNull()
    const shown = Number(screen.getByRole('group', { name: S.strokesOf(nameOf('p1')) }).textContent?.replace(/\D+/g, ''))
    expect(shown).toBe(8)
  })

  it('a 10-start group (10–18, 1–9): hole 3 queued, then the race', async () => {
    base.groups = base.groups.map((g) => ({ ...g, startHole: 10 }))
    base.scores = []
    for (const pid of PIDS) for (const h of [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2]) base.scores.push({ roundId: 'r1', playerId: pid, hole: h, strokes: 5, putts: 2, pickedUp: false, enteredBy: 'p1', updatedAt: '2027-05-15T15:00:00Z' })
    await queueHole(3, TYPED)
    coldRestart()
    seedBoards(base)
    mount()
    expect(holeOnScreen()).toBe(3)
    await readQueue()
    expect(holeOnScreen()).toBe(4)
    await tapSave(20_000)
    expect(queuedAt(3)).toEqual(TYPED_Q)
  })

  it('a signed card, the Comité: no reason sheet opens before the queue is read, and nothing is written', async () => {
    base.pairs = [
      { id: 'pa', name: null, player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'pb', name: null, player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    base.cardSignatures = [{ roundId: 'r1', pairId: 'pa', signedBy: 'p3', signedAt: '2027-05-15T18:00:00Z' }]
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    mount({ isAdmin: true })
    expect(holeOnScreen()).toBe(10)
    await tapSave(20_000)
    expect(screen.queryByRole('dialog', { name: S.signedReasonTitle })).toBeNull()
    await readQueue()
    const direct = admin.saves.map((s) => `${s.row.player_id}@${s.row.hole}=${s.row.strokes}/${s.row.putts}`)
    expect({ direct, q: queuedAt(10) }).toEqual({ direct: [], q: TYPED_Q })
  })

  it('no «¿Seguro?» sheet opens before the queue is read: the queued hole is never confirmed over', async () => {
    // p2 has a 10 on hole 10 on the server; p1, p3, p4 wait in the queue.
    base.scores.push({ roundId: 'r1', playerId: 'p2', hole: 10, strokes: 10, putts: 2, pickedUp: false, enteredBy: 'p3', updatedAt: '2027-05-15T15:00:00Z' })
    await queueHole(10, { p1: TYPED.p1, p3: TYPED.p3, p4: TYPED.p4 })
    coldRestart()
    seedBoards(base)
    mount()
    expect(holeOnScreen()).toBe(10)
    await tapSave(20_000)
    expect(screen.queryByRole('dialog', { name: S.weirdTitle })).toBeNull()
    await readQueue()
    const q = queuedAt(10)
    expect({ p1: q.p1, p3: q.p3, p4: q.p4 }).toEqual({ p1: TYPED_Q.p1, p3: TYPED_Q.p3, p4: TYPED_Q.p4 })
  })

  it('a hole picked on the grid stays put when the queue lands', async () => {
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    mount()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(S.grid) }))
    fireEvent.click(screen.getByRole('button', { name: /^9$/ }))
    expect(holeOnScreen()).toBe(9)
    await readQueue()
    expect(holeOnScreen()).toBe(9)
  })

  it('a signed card, a player (not the Comité): nothing is written', async () => {
    base.pairs = [
      { id: 'pa', name: null, player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'pb', name: null, player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    base.cardSignatures = [{ roundId: 'r1', pairId: 'pa', signedBy: 'p3', signedAt: '2027-05-15T18:00:00Z' }]
    await queueHole(10, TYPED)
    coldRestart()
    seedBoards(base)
    mount()
    await tapSave(20_000).catch(() => undefined)
    await readQueue()
    expect(queuedAt(10)).toEqual(TYPED_Q)
  })
})

describe('the hole-following, under a user who has not touched anything', () => {
  it('another phone saves the hole on screen: where does the next «Guardar» land?', async () => {
    seedBoards(base)
    mount()
    expect(holeOnScreen()).toBe(10)
    // Another phone in the group saves hole 10 for all four (Realtime).
    const next = structuredClone(base)
    for (const pid of PIDS) next.scores.push({ roundId: 'r1', playerId: pid, hole: 10, strokes: 5, putts: 2, pickedUp: false, enteredBy: 'p3', updatedAt: '2027-05-15T15:00:00Z' })
    base = next
    act(() => seedBoards(next))
    const after = holeOnScreen()
    // This phone, about to confirm hole 10 as all par, taps «Guardar» two seconds later.
    await tapSave(12_000)
    expect({ after, hole11: queuedAt(11) }).toEqual({ after: 10, hole11: {} })
  })
})

void refresh

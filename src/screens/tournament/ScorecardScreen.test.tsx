// @vitest-environment happy-dom
/**
 * The Tarjeta's save, on the real screen and the `minimal4-live` fixture
 * (p1, p3, p4 through hole 9; p2 through 11), with the outbox mocked so
 * every write is recorded instead of sent.
 *
 * REL-05: a save wrote all four players, untouched ones at par, over what the
 * other phone had saved. UX-02: a second tap saved the next hole with
 * defaults. PWA-01: the confirmation toast sat on «Guardar hoyo».
 * A11Y-01: the four players' controls had the same names, the hole was a bare
 * figure, and a change was announced as a bare number.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const outbox = vi.hoisted(() => ({ scores: [] as Array<Record<string, unknown>>, holes: [] as Array<{ round_id: string; hole: number; entries: import('../../data/outbox').HoleEntry[] }> }))
vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return {
    ...real,
    enqueueScore: vi.fn(async (_tid: string, row: Record<string, unknown>) => void outbox.scores.push(row)),
    // A group's hole (REL-05): recorded as the call, and each player as the row it makes over what the phone saw.
    enqueueHole: vi.fn(async (_tid: string, h: { round_id: string; hole: number; entries: import('../../data/outbox').HoleEntry[] }) => {
      outbox.holes.push(structuredClone(h))
      for (const e of h.entries) outbox.scores.push({ round_id: h.round_id, player_id: e.player_id, hole: h.hole, ...real.applyFields(real.baseRow(e.base), e.fields) })
    }),
    enqueueAward: vi.fn(async () => undefined),
    enqueueTiebreak: vi.fn(async () => undefined),
    enqueueSignature: vi.fn(async () => undefined),
  }
})
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
const admin = vi.hoisted(() => ({ saves: [] as Array<{ row: Record<string, unknown>; reason: string }> }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  adminSaveScore: vi.fn(async (row: Record<string, unknown>, reason: string) => void admin.saves.push({ row, reason })),
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../components/ui')>()), toast: vi.fn() }))

import { toast } from '../../components/ui'
import { adminSaveScore } from '../../data/api'
import { useAuth } from '../../data/auth'
import { enqueueTiebreak, useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card
let clock = 0

// A canceled animation rejects its `finished` promise, and the spec marks that
// rejection as handled (browsers never report it). happy-dom doesn't, so a
// snake marker still sliding when the card closes surfaced as an unhandled
// AbortError. Do what the spec does.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}
let snap: Snapshot

function load(s: Snapshot) {
  useTournament.setState({ tournamentId: 'fixture:minimal4-live', data: dataFromSnapshot(structuredClone(s)), loading: false, error: null, realtime: 'off' })
}

function mount(edit?: (s: Snapshot) => void, opts: { fixture?: string; isAdmin?: boolean } = {}) {
  const name = opts.fixture ?? 'minimal4-live'
  const fx = getFixture(name)!
  snap = structuredClone(fx.snapshot)
  edit?.(snap)
  load(snap)
  const me = { ...fx.me, isAdmin: opts.isAdmin ?? fx.me.isAdmin }
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${name}`, lookup: fx.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

/** The other phone's save landing through Realtime. */
function remoteSave(playerId: string, hole: number, strokes: number, putts: number) {
  snap.scores = snap.scores.filter((x) => !(x.playerId === playerId && x.hole === hole && x.roundId === 'r1'))
  snap.scores.push({ roundId: 'r1', playerId, hole, strokes, putts, pickedUp: false, enteredBy: 'p4', updatedAt: '2027-05-15T15:00:00Z' })
  act(() => load(snap))
}

const holeOnScreen = () => Number(document.querySelector('[class*="holeNum"]')?.textContent)
const nameOf = (playerId: string) => snap.players.find((p) => p.id === playerId)!.displayName
/** A player's strokes stepper, found by his name the way a screen reader finds it. */
const strokesOf = (playerId: string) => Number(screen.getByRole('group', { name: S.strokesOf(nameOf(playerId)) }).textContent?.replace(/\D+/g, ''))
const strokesUp = (playerId: string) => screen.getByRole('button', { name: `${S.strokesOf(nameOf(playerId))}: ${t.common.stepUp}` })
const saveButton = () => screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast})$`) })
async function tapSave(at: number) {
  clock = at
  await act(async () => {
    fireEvent.click(saveButton())
  })
}
const written = () => outbox.scores.map((r) => `${r.player_id}@${r.hole}=${r.strokes}/${r.putts}`)

beforeEach(() => {
  localStorage.clear()
  // The phone's queue has been read (AppShell's startOutbox); NEW-11's cases open before it.
  useOutbox.setState({ queueRead: true })
  outbox.scores = []
  outbox.holes = []
  clock = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.mocked(toast).mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Tarjeta: a save writes only what this phone means (REL-05)', () => {
  it('a player the other phone already saved is not overwritten with a default', async () => {
    mount()
    expect(holeOnScreen()).toBe(10)
    // p2 was saved on hole 10 by another phone before this one opened it.
    const p2Saved = snap.scores.find((x) => x.playerId === 'p2' && x.hole === 10)!
    // This phone enters p1 only.
    fireEvent.click(strokesUp('p1'))
    // Meanwhile the other phone saves p3 with a 7 and 3 putts.
    remoteSave('p3', 10, 7, 3)
    expect(strokesOf('p3')).toBe(7)
    await tapSave(11_000)
    const rows = written()
    expect(rows.some((r) => r.startsWith('p2@'))).toBe(false)
    expect(rows.some((r) => r.startsWith('p3@'))).toBe(false)
    expect(rows.filter((r) => r.startsWith('p1@10='))).toHaveLength(1)
    // p4 has nothing on the server: the default (par, 2 putts) is what an all-par tap means.
    expect(rows.filter((r) => r.startsWith('p4@10='))).toHaveLength(1)
    expect(p2Saved.strokes).not.toBeNull()
  })

  it('what this phone typed is kept when the other phone saves the same player', () => {
    mount()
    const before = strokesOf('p1')
    fireEvent.click(strokesUp('p1'))
    remoteSave('p1', 10, 9, 2)
    expect(strokesOf('p1')).toBe(before + 1)
  })
})

describe('Tarjeta: a hole goes out as one save, over what the phone saw (REL-05, outbox v2)', () => {
  const entry = (pid: string) => outbox.holes[0]!.entries.find((e) => e.player_id === pid)
  it('one call for the hole: the player touched and the defaults of the unplayed, each over the row it saw', async () => {
    mount()
    expect(holeOnScreen()).toBe(10)
    const par = strokesOf('p1')
    fireEvent.click(strokesUp('p1'))
    await tapSave(11_000)
    expect(outbox.holes).toHaveLength(1)
    expect(outbox.holes[0]!.hole).toBe(10)
    // p2 already saved by the other phone: not in the call at all.
    expect(outbox.holes[0]!.entries.map((e) => e.player_id).sort()).toEqual(['p1', 'p3', 'p4'])
    expect(entry('p1')).toEqual({ player_id: 'p1', fields: { strokes: par + 1, putts: 2 }, base: {}, auto: false, dflt: { strokes: par, putts: 2, picked_up: false } })
    // An untouched default: a conflict on it takes the other phone's value without asking.
    expect(entry('p4')).toMatchObject({ fields: { strokes: par, putts: 2 }, base: {}, auto: true })
  })

  it('a correction sends only the field changed, over the row the phone saw', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: S.prev }))
    expect(holeOnScreen()).toBe(9)
    const saved = snap.scores.find((x) => x.playerId === 'p1' && x.hole === 9 && x.roundId === 'r1')!
    fireEvent.click(strokesUp('p1'))
    await tapSave(11_000)
    expect(outbox.holes).toHaveLength(1)
    expect(outbox.holes[0]!.entries).toEqual([
      { player_id: 'p1', fields: { strokes: saved.strokes! + 1 }, base: { strokes: saved.strokes, putts: saved.putts, picked_up: false }, auto: false, dflt: expect.objectContaining({ putts: 2, picked_up: false }) },
    ])
  })

  it('what the phone saw is taken at the first touch: a save from the other phone after it is no base of this one (the server asks)', async () => {
    mount()
    const par = strokesOf('p3')
    fireEvent.click(strokesUp('p3'))
    remoteSave('p3', 10, 7, 3)
    await tapSave(11_000)
    expect(entry('p3')).toEqual({ player_id: 'p3', fields: { strokes: par + 1, putts: 2 }, base: {}, auto: false, dflt: { strokes: par, putts: 2, picked_up: false } })
  })

  it('each player\'s default is par for his own tee: an untouched par 5 from the forward tees is that, not the lead player\'s par 4', async () => {
    // p4 plays the forward tees, where hole 10 is a par 5 (the others' is a 4).
    mount((s) => {
      const course = s.courses.find((c) => c.id === 'course1')!
      const back = course.tees.find((x) => x.id === 'tee1')!
      course.tees.push({ ...structuredClone(back), id: 'tee2', name: 'Rojas', holes: back.holes.map((h) => (h.number === 10 ? { ...h, par: 5 } : { ...h })) })
      s.players = s.players.map((p) => (p.id === 'p4' ? { ...p, defaultTeeId: 'tee2' } : p))
    })
    expect(holeOnScreen()).toBe(10)
    expect(strokesOf('p1')).toBe(4)
    expect(strokesOf('p4')).toBe(5)
    fireEvent.click(strokesUp('p1'))
    await tapSave(11_000)
    // What another phone's untouched save of each would be, the value this phone may go over without asking.
    expect(entry('p1')!.dflt).toEqual({ strokes: 4, putts: 2, picked_up: false })
    expect(entry('p4')).toMatchObject({ fields: { strokes: 5, putts: 2 }, auto: true, dflt: { strokes: 5, putts: 2, picked_up: false } })
  })

  it('a pick-up sends the pick-up and the strokes it clears, over the row seen', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: S.prev }))
    const saved = snap.scores.find((x) => x.playerId === 'p3' && x.hole === 9 && x.roundId === 'r1')!
    fireEvent.click(screen.getByRole('button', { name: S.pickedUpOf(nameOf('p3')) }))
    await tapSave(11_000)
    expect(outbox.holes[0]!.entries).toEqual([
      { player_id: 'p3', fields: { strokes: null, picked_up: true }, base: { strokes: saved.strokes, putts: saved.putts, picked_up: false }, auto: false, dflt: expect.objectContaining({ putts: 2 }) },
    ])
  })
})

describe('Tarjeta: a double tap saves one hole (UX-02)', () => {
  it('ignores a second tap right after the hole changed', async () => {
    mount()
    await tapSave(11_000)
    expect(holeOnScreen()).toBe(11)
    const afterFirst = written().length
    await tapSave(11_250)
    expect(written()).toHaveLength(afterFirst)
    expect(holeOnScreen()).toBe(11)
  })

  it('asks before saving untouched defaults on a hole nobody played, seconds after the last save', async () => {
    mount()
    await tapSave(11_000) // hole 10
    await tapSave(20_000) // hole 11 (p2 had it already)
    expect(holeOnScreen()).toBe(12)
    const before = written().length
    await tapSave(21_000)
    expect(written()).toHaveLength(before)
    const sheet = screen.getByRole('dialog', { name: S.allDefaultsTitle(12) })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: S.allDefaultsConfirm }))
    })
    expect(written().filter((r) => r.includes('@12='))).toHaveLength(4)
    // «Sí, todos par» is the player confirming the four pars: his capture, sent without `auto`, so a refusal of it
    // (the day closed, a card signed) reaches the Comité like any typed value (REL-08, N2).
    const h12 = outbox.holes.find((h) => h.hole === 12)!
    expect(h12.entries).toHaveLength(4)
    expect(h12.entries.map((e) => e.auto)).toEqual([false, false, false, false])
    // The hole before, saved with one tap and no question, kept its untouched defaults as such.
    expect(outbox.holes.find((h) => h.hole === 10)!.entries.filter((e) => e.auto).length).toBeGreaterThan(0)
  })

  it('a hole played normally, long after the last save, needs no question', async () => {
    mount()
    await tapSave(11_000)
    await tapSave(11_000 + 4 * 60_000)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(written().filter((r) => r.includes('@11='))).toHaveLength(3)
  })
})

describe('Tarjeta: offline, the line says how many holes wait on the phone (REL-17)', () => {
  it('«Sin señal · 2 hoyos en el teléfono»', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    try {
      mount()
      act(() => useOutbox.setState({ pending: 8, pendingHoles: 2 }))
      expect(screen.getByText(t.sync.offlineHoles(2))).toBeTruthy()
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
      useOutbox.setState({ pending: 0, pendingHoles: 0 })
    }
  })
})

describe('Tarjeta: holes saved after the phone lost its session need the PIN, and it says so (REL-16)', () => {
  afterEach(() => {
    useOutbox.setState({ pending: 0, pendingHoles: 0, held: 0, heldHoles: 0 })
    useAuth.setState({ user: null })
  })

  it('«1 hoyo espera tu PIN», not only «por subir»', () => {
    mount()
    // auth-js signed the phone out mid-round (its refresh token was dead): the hole saved since waits for the player.
    act(() => useOutbox.setState({ pending: 4, pendingHoles: 1, held: 4, heldHoles: 1 }))
    expect(screen.getByText(t.sync.heldForPinShort(1))).toBeTruthy()
  })

  it('while the stored session is only waiting to be confirmed, the holes are only waiting too', () => {
    localStorage.setItem('cardi-golf-auth', '{}')
    mount()
    act(() => useOutbox.setState({ pending: 4, pendingHoles: 1, held: 4, heldHoles: 1 }))
    expect(screen.getByText(t.sync.pendingHoles(1))).toBeTruthy()
    expect(screen.queryByText(/PIN/)).toBeNull()
  })
})

describe('Tarjeta: the confirmation lives in the save bar (PWA-01)', () => {
  it('shows «Hoyo N guardado · Corregir» under the button, not in a toast over it', async () => {
    mount()
    await tapSave(11_000)
    expect(toast).not.toHaveBeenCalled()
    const bar = saveButton().parentElement as HTMLElement
    expect(within(bar).getByText(S.savedHole(10))).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: S.correct }))
    })
    expect(holeOnScreen()).toBe(10)
  })
})

describe('Tarjeta: a screen reader knows whose control it is and where it is (A11Y-01)', () => {
  const live = () => document.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent ?? ''

  it('every control on the hole has its own name, and each player\'s controls carry his name', () => {
    mount()
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
    expect(new Set(names).size).toBe(names.length)
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      const name = nameOf(id)
      const row = screen.getByRole('group', { name })
      for (const label of [`${S.strokesOf(name)}: ${t.common.stepDown}`, `${S.strokesOf(name)}: ${t.common.stepUp}`, `${S.puttsOf(name)}: ${t.common.stepDown}`, `${S.puttsOf(name)}: ${t.common.stepUp}`, S.pickedUpOf(name)]) {
        expect(within(row).getByRole('button', { name: label })).toBeTruthy()
      }
    }
  })

  it('the hole is the page heading: «Hoyo 10, par …»', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: /^Hoyo 10, par \d, índice de golpe \d+/ })).toBeTruthy()
  })

  it('a tap says whose score changed and what it is worth; a save says the new hole', async () => {
    mount()
    expect(live()).toBe('')
    const before = strokesOf('p1')
    fireEvent.click(strokesUp('p1'))
    expect(live()).toMatch(new RegExp(`^${nameOf('p1')}: ${before + 1} golpes, 2 putts, \\d pts`))
    // The figures themselves are not live regions: a new hole would read out eight bare numbers.
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
    await tapSave(11_000)
    // One message, not two at once: the saved note under the button is not a second live region.
    expect(live()).toMatch(/^Hoyo 10 guardado\. Hoyo 11, par \d/)
  })

  it('two players with the same short name are told apart by their full names', () => {
    mount((s) => {
      const p1 = s.players.find((p) => p.id === 'p1')!
      const p3 = s.players.find((p) => p.id === 'p3')!
      Object.assign(p1, { displayName: 'Diego', fullName: 'Diego Arámburu' })
      Object.assign(p3, { displayName: 'Diego', fullName: 'Diego Ortiz Tirado' })
    })
    for (const full of ['Diego Arámburu', 'Diego Ortiz Tirado']) {
      const row = screen.getByRole('group', { name: full })
      expect(within(row).getByRole('button', { name: `${S.strokesOf(full)}: ${t.common.stepUp}` })).toBeTruthy()
      expect(within(row).getByRole('button', { name: S.pickedUpOf(full) })).toBeTruthy()
    }
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('Tarjeta: a half-entered hole survives leaving the card (PWA-05)', () => {
  /** The other phone's save on hole 10, in the snapshot this phone loads. */
  const savedElsewhere = (playerId: string, strokes: number) => (s: Snapshot) => {
    s.scores = s.scores.filter((x) => !(x.playerId === playerId && x.hole === 10 && x.roundId === 'r1'))
    s.scores.push({ roundId: 'r1', playerId, hole: 10, strokes, putts: 3, pickedUp: false, enteredBy: 'p4', updatedAt: '2027-05-15T15:00:00Z' })
  }

  it('what was typed comes back when the card opens again, and says it is not saved yet', () => {
    const first = mount()
    const before = strokesOf('p1')
    fireEvent.click(strokesUp('p1'))
    fireEvent.click(strokesUp('p1'))
    first.unmount()
    mount()
    expect(holeOnScreen()).toBe(10)
    expect(strokesOf('p1')).toBe(before + 2)
    expect(screen.getByText(S.restoredDraft)).toBeTruthy()
  })

  it('a player the other phone saved since gets the save; the others get what was typed', () => {
    const first = mount()
    const before = strokesOf('p1')
    fireEvent.click(strokesUp('p1'))
    fireEvent.click(strokesUp('p3'))
    first.unmount()
    mount(savedElsewhere('p3', 8))
    expect(strokesOf('p1')).toBe(before + 1)
    expect(strokesOf('p3')).toBe(8)
  })

  it('opened on a stale snapshot, a restored draft gives way when the newer save arrives, and is never written over it', async () => {
    const first = mount()
    fireEvent.click(strokesUp('p3'))
    first.unmount()
    // Opened offline on the cached snapshot: p3's draft comes back.
    mount()
    expect(strokesOf('p3')).not.toBe(8)
    // The fresh snapshot brings the other phone's save of p3.
    remoteSave('p3', 10, 8, 3)
    expect(strokesOf('p3')).toBe(8)
    expect(screen.queryByText(S.restoredDraft)).toBeNull()
    await tapSave(11_000)
    expect(written().filter((r) => r.startsWith('p3@'))).toEqual([])
  })

  it('a restored draft that gave way to a newer save, touched again, goes over the row it now shows: not the one it was restored on', async () => {
    const first = mount()
    fireEvent.click(strokesUp('p3'))
    first.unmount()
    // Opened on the cached snapshot (p3 has nothing on hole 10 there): the draft comes back, over that.
    mount()
    expect(screen.getByText(S.restoredDraft)).toBeTruthy()
    // The other phone's 8 arrives: the draft gives way.
    remoteSave('p3', 10, 8, 3)
    expect(strokesOf('p3')).toBe(8)
    // The player corrects the 8 he now sees to a 9.
    fireEvent.click(strokesUp('p3'))
    await tapSave(11_000)
    const p3 = outbox.holes[0]!.entries.find((e) => e.player_id === 'p3')
    // Over the 8 (the server takes it), never over the empty row the draft was restored on (a false «ya capturó»).
    expect(p3).toMatchObject({ fields: { strokes: 9 }, base: { strokes: 8, putts: 3, picked_up: false } })
  })

  it('a baseline is taken once: a save that lands after p3 was typed here keeps that draft from coming back over it', () => {
    const first = mount()
    fireEvent.click(strokesUp('p3'))
    // The other phone saves p3 while this phone is still on the hole (what was typed here stays on screen: REL-05).
    remoteSave('p3', 10, 8, 3)
    // More typing rewrites the kept draft; p3's baseline must stay what the server had when he was typed.
    fireEvent.click(strokesUp('p1'))
    first.unmount()
    mount(savedElsewhere('p3', 8))
    expect(strokesOf('p3')).toBe(8)
  })

  it('a card that can no longer be edited (signed) never shows a leftover draft', () => {
    const groupOf = (s: Snapshot) => s.groups.find((g) => g.roundId === 'r2' && g.playerIds.includes('p9'))!
    const first = mount(undefined, { fixture: 'full12-live' })
    const g = groupOf(snap)
    const pid = g.playerIds[0]!
    const before = strokesOf(pid)
    fireEvent.click(strokesUp(pid))
    first.unmount()
    mount(
      (s) => {
        const pair = s.pairs.find((p) => p.player1Id === pid || p.player2Id === pid)!
        s.cardSignatures.push({ roundId: 'r2', pairId: pair.id, signedBy: pair.player1Id, signedAt: '2027-04-10T14:30:00Z' })
      },
      { fixture: 'full12-live', isAdmin: false },
    )
    expect(strokesOf(pid)).toBe(before)
    expect(screen.queryByText(S.restoredDraft)).toBeNull()
  })

  it('touching a restored player keeps the note until the hole is saved', async () => {
    const first = mount()
    fireEvent.click(strokesUp('p1'))
    first.unmount()
    mount()
    expect(screen.getByText(S.restoredDraft)).toBeTruthy()
    fireEvent.click(strokesUp('p1'))
    expect(screen.getByText(S.restoredDraft)).toBeTruthy()
    await tapSave(11_000)
    expect(screen.queryByText(S.restoredDraft)).toBeNull()
  })

  it('the last hole stays open after its save: a correction there is kept against the save, and the next save writes only it', async () => {
    window.history.replaceState(null, '', '/?hoyo=18')
    try {
      const first = mount()
      expect(holeOnScreen()).toBe(18)
      const par = strokesOf('p1')
      fireEvent.click(strokesUp('p1'))
      fireEvent.click(strokesUp('p3'))
      await tapSave(11_000)
      // The save lands for all four, and «Corregir» brings the hole back.
      const saved = Object.fromEntries(outbox.scores.map((r) => [r.player_id as string, r]))
      for (const pid of ['p1', 'p2', 'p3', 'p4']) remoteSave(pid, 18, saved[pid]!.strokes as number, saved[pid]!.putts as number)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: S.correct }))
      })
      expect(holeOnScreen()).toBe(18)
      fireEvent.click(strokesUp('p1'))
      expect(strokesOf('p1')).toBe(par + 2)
      // Leaving and coming back keeps the correction: it was made after the save.
      first.unmount()
      mount((s) => {
        for (const pid of ['p1', 'p2', 'p3', 'p4']) s.scores.push({ roundId: 'r1', playerId: pid, hole: 18, strokes: saved[pid]!.strokes as number, putts: saved[pid]!.putts as number, pickedUp: false, enteredBy: 'p1', updatedAt: '2027-05-15T15:00:00Z' })
      })
      expect(strokesOf('p1')).toBe(par + 2)
      expect(screen.getByText(S.restoredDraft)).toBeTruthy()
      // Saving it writes p1 alone; p3, touched before the first save, is not written again.
      outbox.scores = []
      await tapSave(20_000)
      expect(written()).toEqual([`p1@18=${par + 2}/2`])
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('a saved hole leaves nothing behind, and the note goes', async () => {
    const first = mount()
    fireEvent.click(strokesUp('p1'))
    first.unmount()
    mount()
    expect(screen.getByText(S.restoredDraft)).toBeTruthy()
    await tapSave(11_000)
    expect(Object.keys(localStorage).filter((k) => k.startsWith('cardi-golf:tarjeta:'))).toEqual([])
    expect(screen.queryByText(S.restoredDraft)).toBeNull()
  })
})

describe('Tarjeta: a Comité correction on a signed card with a snake tie (the verifier of PR #81)', () => {
  it('the reason sheet gives way to «¿Quién embocó al último?», and the hole saves only with the answer', async () => {
    admin.saves = []
    vi.mocked(enqueueTiebreak).mockClear()
    window.history.replaceState(null, '', '/?hoyo=18')
    try {
      mount(undefined, { fixture: 'full12-finished', isAdmin: true })
      // Two players take 3 putts: the snake needs to know who holed out last.
      const puttsGroups = screen.getAllByRole('group', { name: new RegExp(`^${S.puttsOf('.+')}$`) })
      const value = (g: HTMLElement) => Number(g.textContent?.replace(/\D+/g, ''))
      for (const g of puttsGroups.slice(0, 2)) {
        const name = g.getAttribute('aria-label')!
        for (let i = 0; i < 6 && value(g) < 3; i++) fireEvent.click(screen.getByRole('button', { name: `${name}: ${t.common.stepUp}` }))
        for (let i = 0; i < 6 && value(g) > 3; i++) fireEvent.click(screen.getByRole('button', { name: `${name}: ${t.common.stepDown}` }))
        expect(value(g)).toBe(3)
      }
      await tapSave(11_000)
      // The card is signed: the Comité gives a reason first.
      const reasonSheet = screen.getByRole('dialog', { name: S.signedReasonTitle })
      fireEvent.change(within(reasonSheet).getByRole('textbox'), { target: { value: 'Error de captura' } })
      await act(async () => {
        fireEvent.click(within(reasonSheet).getByRole('button', { name: S.save }))
      })
      // Then the question, alone on top: the reason sheet is gone, nothing was saved yet.
      expect(screen.queryByRole('dialog', { name: S.signedReasonTitle })).toBeNull()
      const ask = screen.getByRole('dialog', { name: S.whoHoledLast })
      expect(admin.saves).toEqual([])
      // The answer saves the hole with the reason, and the answer with it.
      await act(async () => {
        fireEvent.click(within(ask).getAllByRole('button')[1]!)
      })
      expect(admin.saves.length).toBeGreaterThan(0)
      expect(admin.saves.every((s) => s.reason === 'Error de captura')).toBe(true)
      expect(enqueueTiebreak).toHaveBeenCalledTimes(1)
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})

describe('Tarjeta: opened before the phone read its queued holes (NEW-11)', () => {
  /** p1–p4 through hole 9, as the phone's copy has them; hole 10 for all four waits in the outbox. */
  const queuedTen = (s: Snapshot) => {
    for (const pid of ['p1', 'p2', 'p3', 'p4']) {
      s.scores = s.scores.filter((x) => !(x.roundId === 'r1' && x.playerId === pid && x.hole >= 10))
    }
  }
  const withTen = (s: Snapshot) => {
    queuedTen(s)
    for (const pid of ['p1', 'p2', 'p3', 'p4']) s.scores.push({ roundId: 'r1', playerId: pid, hole: 10, strokes: 7, putts: 3, pickedUp: false, enteredBy: 'p1', updatedAt: '2027-05-15T15:00:00Z' })
  }
  /** The outbox reads its queue: the boards recompute with it, then it says so (outbox.ts, loadQueue). */
  const queueIsRead = () =>
    act(() => {
      withTen(snap)
      load(snap)
      useOutbox.setState({ queueRead: true })
    })
  beforeEach(() => useOutbox.setState({ queueRead: false }))
  afterEach(() => useOutbox.setState({ queueRead: false }))

  it('moves to the first open hole once the queued holes show, and never writes defaults over them', async () => {
    mount(queuedTen)
    expect(holeOnScreen()).toBe(10)
    queueIsRead()
    expect(holeOnScreen()).toBe(11)
    await tapSave(20_000)
    expect(written().filter((r) => r.includes('@10='))).toEqual([])
  })

  it('before the queue is read, «Guardar» waits: a tap writes nothing over holes the phone may hold', async () => {
    mount(queuedTen)
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    await tapSave(20_000)
    expect(written()).toEqual([])
    queueIsRead()
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('a hole the player chose stays put when the queued holes show', () => {
    mount(queuedTen)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(S.prev) }))
    expect(holeOnScreen()).toBe(9)
    queueIsRead()
    expect(holeOnScreen()).toBe(9)
  })

  it('a player touched on the open hole keeps it: the card does not move under his finger', () => {
    mount(queuedTen)
    fireEvent.click(strokesUp('p1'))
    queueIsRead()
    expect(holeOnScreen()).toBe(10)
    // Untouched players take the queued values (REL-05); the touched one keeps what was typed.
    expect(strokesOf('p2')).toBe(7)
  })

  it('opened after the queue was read, the card stays on its hole when another phone saves it: the values land where it looks', () => {
    useOutbox.setState({ queueRead: true })
    mount(queuedTen)
    expect(holeOnScreen()).toBe(10)
    act(() => {
      withTen(snap)
      load(snap)
    })
    expect(holeOnScreen()).toBe(10)
    expect(strokesOf('p2')).toBe(7)
  })
})

describe('Tarjeta: an admin player writes where a phone may not through the Comité path (0026, REL-09)', () => {
  /** Puts the first player's strokes on the open hole up one, and saves. */
  async function correctFirstAndSave() {
    const strokes = screen.getAllByRole('group', { name: new RegExp(`^${S.strokesOf('.+')}$`) })[0]!
    fireEvent.click(screen.getByRole('button', { name: `${strokes.getAttribute('aria-label')}: ${t.common.stepUp}` }))
    await tapSave(11_000)
  }

  it('a finished round, no card signed: admin_save_score, with no reason asked, and nothing through the outbox', async () => {
    admin.saves = []
    window.history.replaceState(null, '', '/?hoyo=18')
    try {
      mount((s) => void (s.cardSignatures = s.cardSignatures.filter((c) => c.roundId !== 'r2')), { fixture: 'full12-finished', isAdmin: true })
      await correctFirstAndSave()
      expect(screen.queryByRole('dialog', { name: S.signedReasonTitle })).toBeNull()
      expect(admin.saves).toHaveLength(1)
      expect(admin.saves[0]).toMatchObject({ row: { round_id: 'r2', hole: 18 }, reason: null })
      expect(outbox.scores).toEqual([])
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('an undo that the server refuses says why and stays offered; the corrected value is not left silently', async () => {
    admin.saves = []
    window.history.replaceState(null, '', '/?hoyo=18')
    try {
      mount((s) => void (s.cardSignatures = s.cardSignatures.filter((c) => c.roundId !== 'r2')), { fixture: 'full12-finished', isAdmin: true })
      await correctFirstAndSave()
      expect(admin.saves).toHaveLength(1)
      vi.mocked(adminSaveScore).mockRejectedValueOnce(new Error('Failed to fetch'))
      vi.mocked(toast).mockClear()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: t.common.undo }))
      })
      expect(toast).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: t.common.undo })).toBeTruthy()
      // Tapped again with signal, it lands.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: t.common.undo }))
      })
      expect(admin.saves).toHaveLength(2)
      expect(screen.getAllByText(S.restoredHole(18)).length).toBeGreaterThan(0)
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('a round not started yet: admin_save_score too, never the outbox', async () => {
    admin.saves = []
    mount((s) => void (s.rounds = s.rounds.map((r) => ({ ...r, status: 'scheduled' as const }))), { isAdmin: true })
    await correctFirstAndSave()
    expect(admin.saves.length).toBeGreaterThan(0)
    expect(outbox.scores).toEqual([])
  })

  it('a live round with the card unsigned: the outbox, as any phone of the group', async () => {
    admin.saves = []
    mount(undefined, { isAdmin: true })
    await correctFirstAndSave()
    expect(admin.saves).toEqual([])
    expect(outbox.scores.length).toBeGreaterThan(0)
  })
})

describe('Tarjeta: a hole opened shows its own values in the same task as its heading (e2e-stack, #104 and #105)', () => {
  /**
   * The stack suite's correction of hole 10 never left Ana's phone: Playwright
   * saw «Hoyo 10» and read Beto's stepper in the next task, and it still showed
   * hole 2's 5 (the hole the card was on). That was the value wanted, so nothing
   * was tapped, nothing was touched, and «Guardar hoyo» wrote nothing. The new
   * hole's values came from a passive effect, whose own update React runs at
   * default priority, tasks later (one to three painted frames in Chromium):
   * until then the new heading stood over the last hole's figures, and a tap
   * there was lost. Interactions are tasks, so
   * the check is what the screen shows once the click's task and its microtasks
   * are done, outside act (which would flush everything first).
   */
  it('from the grid: no task ever sees the new hole under the last one\'s figures', async () => {
    mount()
    expect(holeOnScreen()).toBe(10)
    // A hole whose saved strokes for p1 differ from what the card shows now.
    const shown = strokesOf('p1')
    const target = snap.scores.find((x) => x.playerId === 'p1' && x.roundId === 'r1' && x.strokes != null && x.strokes !== shown)!
    fireEvent.click(screen.getByRole('button', { name: S.grid, exact: true } as never))
    const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const was = actEnv.IS_REACT_ACT_ENVIRONMENT
    actEnv.IS_REACT_ACT_ENVIRONMENT = false
    try {
      screen.getByRole('button', { name: String(target.hole), exact: true } as never).click()
      for (let i = 0; i < 20; i++) await Promise.resolve()
      expect(holeOnScreen()).toBe(target.hole)
      expect(strokesOf('p1')).toBe(target.strokes)
    } finally {
      actEnv.IS_REACT_ACT_ENVIRONMENT = was
      await act(async () => undefined)
    }
  })

  // Worse than a lost tap: on main «más» there counted from the last hole's figure, and the save wrote that ±1 as
  // this hole's score (PR 107's verifier).
  it('a tap right after the grid opens a hole counts from that hole\'s own figure, and that is what the save writes', async () => {
    mount()
    const shown = strokesOf('p1')
    const target = snap.scores.find((x) => x.playerId === 'p1' && x.roundId === 'r1' && x.strokes != null && x.strokes !== shown && x.strokes < 14)!
    fireEvent.click(screen.getByRole('button', { name: S.grid, exact: true } as never))
    const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const was = actEnv.IS_REACT_ACT_ENVIRONMENT
    actEnv.IS_REACT_ACT_ENVIRONMENT = false
    try {
      screen.getByRole('button', { name: String(target.hole), exact: true } as never).click()
      for (let i = 0; i < 20; i++) await Promise.resolve()
      // The finger's next tap, before any other task: «más» on p1.
      strokesUp('p1').click()
      for (let i = 0; i < 20; i++) await Promise.resolve()
    } finally {
      actEnv.IS_REACT_ACT_ENVIRONMENT = was
      await act(async () => undefined)
    }
    expect(holeOnScreen()).toBe(target.hole)
    expect(strokesOf('p1')).toBe((target.strokes as number) + 1)
    await tapSave(20_000)
    const p1 = written().filter((r) => r.startsWith(`p1@${target.hole}=`))
    expect(p1).toEqual([`p1@${target.hole}=${(target.strokes as number) + 1}/${Math.min(target.putts as number, (target.strokes as number) + 1)}`])
  })
})

describe('Tarjeta: a player the Comité adds to the group while a hole is open (PR 107\'s verifier)', () => {
  it('gets a draft on the open hole, and «Guardar hoyo» saves him with the others instead of throwing', async () => {
    mount()
    expect(holeOnScreen()).toBe(10)
    const p4 = snap.players.find((p) => p.id === 'p4')!
    snap.players.push({ ...p4, id: 'p5', displayName: 'Quinto', fullName: 'Quinto Jugador' })
    const g = snap.groups.find((x) => x.playerIds.includes('p1'))!
    g.playerIds = [...g.playerIds, 'p5']
    act(() => load(snap))
    expect(strokesOf('p5')).toBeGreaterThan(0)
    await tapSave(20_000)
    expect(written().some((r) => r.startsWith('p5@10='))).toBe(true)
  })
})

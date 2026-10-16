// @vitest-environment happy-dom
/**
 * PERF-10: «Guardar hoyo» waited for the outbox to write the hole and the
 * whole tournament to be recomputed before the card moved on: a third of a
 * second on a mid-range phone, half a second at sixty players, eleven commits.
 * Now the card moves on in the tap's own commit: the hole goes into the
 * phone's storage at the tap, and the boards take it once that frame is on
 * screen (the write itself waited for the frame at first, and an app closed
 * inside it lost the hole). If the phone's storage refuses the hole, the card
 * goes back to it with what was typed. A Comité correction, which the server
 * can refuse, still waits for its answer.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type HoleWrite = { round_id: string; hole: number; entries: import('../../data/outbox').HoleEntry[] }
const outbox = vi.hoisted(() => ({
  /** Hold each hole's storage write until the test lets it land (or fail). */
  hold: false,
  /** Holes whose storage write started: as the outbox does, at the call, before anything waits. */
  started: [] as HoleWrite[],
  pending: [] as Array<{ land: () => void; fail: (e: unknown) => void }>,
  apply: null as null | ((h: HoleWrite) => void),
}))
vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return {
    ...real,
    // Like the outbox: the hole goes into storage at the call; the boards take it once `settle` resolves.
    enqueueHole: vi.fn((_tid: string, h: HoleWrite, settle?: Promise<unknown>) => {
      outbox.started.push(h)
      const stored = outbox.hold ? new Promise<void>((resolve, reject) => outbox.pending.push({ land: resolve, fail: reject })) : Promise.resolve()
      return stored.then(async () => {
        await settle
        outbox.apply?.(h)
      })
    }),
    enqueueScore: vi.fn(async () => undefined),
    enqueueAward: vi.fn(async () => undefined),
    enqueueTiebreak: vi.fn(async () => undefined),
    enqueueSignature: vi.fn(async () => undefined),
  }
})
const admin = vi.hoisted(() => ({ pending: [] as Array<() => void> }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  adminSaveHole: vi.fn(() => new Promise<void>((resolve) => admin.pending.push(resolve))),
}))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/toast', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../components/toast')>()), toast: vi.fn() }))

import { toast } from '../../components/toast'
import { OutboxStorageError, applyFields, baseRow, useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './tournamentContext'

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

const S = t.card
let clock = 0
let snap: Snapshot
let commits = 0

function load(s: Snapshot) {
  useTournament.setState({ tournamentId: `fixture:${s.tournament.slug}`, data: dataFromSnapshot(structuredClone(s)), loading: false, error: null, realtime: 'off' })
}
function mount(fixture: string, opts: { isComite?: boolean; edit?: (s: Snapshot) => void } = {}) {
  const fx = getFixture(fixture)!
  snap = structuredClone(fx.snapshot)
  opts.edit?.(snap)
  load(snap)
  const me = { ...fx.me, isComite: opts.isComite ?? fx.me.isComite }
  return render(
    <Profiler id="card" onRender={() => void commits++}>
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me, refresh: async () => undefined, leave: async () => undefined }}>
          <ScorecardScreen />
        </TournamentContext.Provider>
      </MemoryRouter>
    </Profiler>,
  )
}
const holeOnScreen = () => Number(document.querySelector('[class*="holeNum"]')?.textContent)
const nameOf = (playerId: string) => snap.players.find((p) => p.id === playerId)!.displayName
const puttsUp = (playerId: string) => screen.getByRole('button', { name: `${S.puttsOf(nameOf(playerId))}: ${t.common.stepUp}` })
const puttsShown = (playerId: string) => Number(screen.getByRole('group', { name: S.puttsOf(nameOf(playerId)) }).querySelector('[class*="stepValue"]')?.textContent)
const saveButton = () => screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast}|${t.common.saving})`) })
/** A tap on «Guardar hoyo», past the settle guard, with nothing flushed after it but React's own commit. */
function tapSave(at: number) {
  clock = at
  act(() => {
    fireEvent.click(saveButton())
  })
}
/** The frame after the tap is on screen (here, the most the card waits for one): the outbox gets the hole. */
const painted = () =>
  act(async () => {
    vi.advanceTimersByTime(100)
  })

beforeEach(() => {
  localStorage.clear()
  useOutbox.setState({ queueRead: true })
  clock = 10_000
  commits = 0
  outbox.hold = false
  outbox.started = []
  outbox.pending = []
  admin.pending = []
  vi.mocked(toast).mockClear()
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  // The saved hole lands on the boards when the outbox has it, as the outbox's overlay puts it there.
  outbox.apply = (h) => {
    for (const e of h.entries) {
      const row = applyFields(baseRow(e.base), e.fields)
      snap.scores = snap.scores.filter((x) => !(x.roundId === h.round_id && x.playerId === e.player_id && x.hole === h.hole))
      snap.scores.push({ roundId: h.round_id, playerId: e.player_id, hole: h.hole, strokes: row.strokes ?? null, putts: row.putts ?? null, pickedUp: !!row.picked_up, enteredBy: 'p1', updatedAt: '2027-05-15T16:00:00Z' })
    }
    load(snap)
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('«Guardar hoyo» answers in the tap’s frame (PERF-10)', () => {
  it('the card is on the next hole in the tap’s own commit, with the outbox still writing; three commits in all', async () => {
    mount('minimal4-live')
    expect(holeOnScreen()).toBe(10)
    outbox.hold = true
    commits = 0
    tapSave(20_000)
    // The hole changed with the tap (its layout effect lays the new hole's drafts before paint, in a second commit).
    expect(holeOnScreen()).toBe(11)
    expect(commits).toBeLessThanOrEqual(2)
    expect(screen.getByText(S.savedCheck)).toBeTruthy()
    // «Guardado» rests on the button as it is, not greyed out while the phone writes.
    expect(saveButton()).toHaveProperty('disabled', false)
    // The hole went into the phone's storage with the tap: an app closed or put away now keeps it.
    expect(outbox.started.map((h) => h.hole)).toEqual([10])
    expect(outbox.pending).toHaveLength(1)
    // Stored, it waits for that frame before the boards take it, so their recompute never holds the frame back.
    const onBoards = () => useTournament.getState().data!.snapshot.scores.filter((x) => x.hole === 10).length
    const before = onBoards()
    await act(async () => outbox.pending[0]!.land())
    expect(onBoards()).toBe(before)
    expect(commits).toBeLessThanOrEqual(2)
    // The frame is on screen: the boards take the hole in one more commit, and that is the save.
    await painted()
    expect(onBoards()).toBeGreaterThan(before)
    expect(commits).toBeLessThanOrEqual(3)
    expect(holeOnScreen()).toBe(11)
    expect(saveButton()).toHaveProperty('disabled', false)
  })

  it('a page put away in that frame takes the hole onto the boards at once: a locked phone draws no frame, and may never run a timer again', async () => {
    mount('minimal4-live')
    const before = useTournament.getState().data!.snapshot.scores.filter((x) => x.hole === 10).length
    tapSave(20_000)
    expect(outbox.started.map((h) => h.hole)).toEqual([10])
    // The phone is locked before any frame or timer: no time passes here.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(useTournament.getState().data!.snapshot.scores.filter((x) => x.hole === 10).length).toBeGreaterThan(before)
    } finally {
      delete (document as { visibilityState?: string }).visibilityState
    }
  })

  it('storage slower than the settle window says «Guardando…», and the next hole waits for it', async () => {
    mount('minimal4-live')
    outbox.hold = true
    tapSave(20_000)
    expect(holeOnScreen()).toBe(11)
    act(() => void vi.advanceTimersByTime(700))
    expect(saveButton().textContent).toContain(t.common.saving)
    expect(saveButton()).toHaveProperty('disabled', true)
    // A tap now saves nothing: hole 11 waits for hole 10.
    clock = 21_000
    fireEvent.click(saveButton())
    await painted()
    expect(outbox.started).toHaveLength(1)
    expect(outbox.pending).toHaveLength(1)
    await act(async () => outbox.pending[0]!.land())
    expect(saveButton()).toHaveProperty('disabled', false)
    expect(saveButton().textContent).toContain(S.save)
  })

  it('a hole the phone’s storage refuses comes back with what was typed, and says why', async () => {
    mount('minimal4-live')
    fireEvent.click(puttsUp('p3'))
    expect(puttsShown('p3')).toBe(3)
    outbox.hold = true
    tapSave(20_000)
    expect(holeOnScreen()).toBe(11)
    // The phone's storage answers before the frame: a refusal does not wait for it either.
    await act(async () => outbox.pending[0]!.fail(new OutboxStorageError()))
    expect(holeOnScreen()).toBe(10)
    expect(puttsShown('p3')).toBe(3)
    expect(toast).toHaveBeenCalledWith(t.sync.storeFailed)
    expect(screen.queryByText(S.savedCheck)).toBeNull()
    // Saved again, it goes.
    outbox.hold = false
    clock = 30_000
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(holeOnScreen()).toBe(11)
    await painted()
    await act(async () => undefined)
    expect(snap.scores.some((x) => x.playerId === 'p3' && x.hole === 10 && x.putts === 3)).toBe(true)
  })

  it('a Comité correction on a closed day waits for the server’s answer before the card moves on', async () => {
    window.history.replaceState(null, '', '/?hoyo=17')
    try {
      mount('full12-finished', { isComite: true, edit: (s) => void (s.cardSignatures = s.cardSignatures.filter((c) => c.roundId !== 'r2')) })
      expect(holeOnScreen()).toBe(17)
      const first = snap.players.find((p) => screen.queryByRole('group', { name: S.puttsOf(p.displayName) }))!
      fireEvent.click(puttsUp(first.id))
      tapSave(20_000)
      expect(admin.pending.length).toBeGreaterThan(0)
      expect(holeOnScreen()).toBe(17)
      await act(async () => {
        for (const done of admin.pending) done()
      })
      // Answered, it moves on: every hole is played, so to the card's grid, not to hole 18 (UX-19).
      expect(screen.getByRole('button', { name: S.holeView })).toBeTruthy()
      expect(screen.getAllByText(S.correctedHole(17, null)).length).toBeGreaterThan(0)
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})

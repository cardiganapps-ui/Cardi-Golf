// @vitest-environment happy-dom
/**
 * PERF-10: «Guardar hoyo» waited for the outbox to write the hole and the
 * whole tournament to be recomputed before the card moved on: a third of a
 * second on a mid-range phone, half a second at sixty players, eleven commits.
 * Now the card moves on in the tap's own commit and the outbox catches up
 * after it. If the phone's storage refuses the hole, the card goes back to it
 * with what was typed. A Comité correction, which the server can refuse, still
 * waits for its answer.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type HoleWrite = { round_id: string; hole: number; entries: import('../../data/outbox').HoleEntry[] }
const outbox = vi.hoisted(() => ({
  /** Hold each hole's write until the test lets it land (or fail). */
  hold: false,
  pending: [] as Array<{ land: () => void; fail: (e: unknown) => void }>,
  apply: null as null | ((h: HoleWrite) => void),
}))
vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return {
    ...real,
    enqueueHole: vi.fn((_tid: string, h: HoleWrite) => {
      if (!outbox.hold) {
        outbox.apply?.(h)
        return Promise.resolve()
      }
      return new Promise<void>((resolve, reject) =>
        outbox.pending.push({
          land: () => {
            outbox.apply?.(h)
            resolve()
          },
          fail: reject,
        }),
      )
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
  adminSaveScore: vi.fn(() => new Promise<void>((resolve) => admin.pending.push(resolve))),
}))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../components/ui')>()), toast: vi.fn() }))

import { toast } from '../../components/ui'
import { OutboxStorageError, applyFields, baseRow, useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

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
function mount(fixture: string, opts: { isAdmin?: boolean; edit?: (s: Snapshot) => void } = {}) {
  const fx = getFixture(fixture)!
  snap = structuredClone(fx.snapshot)
  opts.edit?.(snap)
  load(snap)
  const me = { ...fx.me, isAdmin: opts.isAdmin ?? fx.me.isAdmin }
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

beforeEach(() => {
  localStorage.clear()
  useOutbox.setState({ queueRead: true })
  clock = 10_000
  commits = 0
  outbox.hold = false
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
    expect(outbox.pending).toHaveLength(1)
    // The write lands: the boards take the hole in one more commit, and that is the save.
    await act(async () => outbox.pending[0]!.land())
    expect(commits).toBeLessThanOrEqual(3)
    expect(holeOnScreen()).toBe(11)
    expect(saveButton()).toHaveProperty('disabled', false)
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
  })

  it('a Comité correction on a closed day waits for the server’s answer before the card moves on', async () => {
    window.history.replaceState(null, '', '/?hoyo=17')
    try {
      mount('full12-finished', { isAdmin: true, edit: (s) => void (s.cardSignatures = s.cardSignatures.filter((c) => c.roundId !== 'r2')) })
      expect(holeOnScreen()).toBe(17)
      const first = snap.players.find((p) => screen.queryByRole('group', { name: S.puttsOf(p.displayName) }))!
      fireEvent.click(puttsUp(first.id))
      tapSave(20_000)
      expect(admin.pending.length).toBeGreaterThan(0)
      expect(holeOnScreen()).toBe(17)
      await act(async () => {
        for (const done of admin.pending) done()
      })
      expect(holeOnScreen()).toBe(18)
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})

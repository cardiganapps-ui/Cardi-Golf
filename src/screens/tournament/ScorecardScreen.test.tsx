// @vitest-environment happy-dom
/**
 * The Tarjeta's save, on the real screen and the `minimal4-live` fixture
 * (p1, p3, p4 through hole 9; p2 through 11), with the outbox mocked so
 * every write is recorded instead of sent.
 *
 * REL-05: a save wrote all four players, untouched ones at par, over what the
 * other phone had saved. UX-02: a second tap saved the next hole with
 * defaults. PWA-01: the confirmation toast sat on «Guardar hoyo».
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const outbox = vi.hoisted(() => ({ scores: [] as Array<Record<string, unknown>> }))
vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return {
    ...real,
    enqueueScore: vi.fn(async (_tid: string, row: Record<string, unknown>) => void outbox.scores.push(row)),
    enqueueAward: vi.fn(async () => undefined),
    enqueueTiebreak: vi.fn(async () => undefined),
    enqueueSignature: vi.fn(async () => undefined),
  }
})
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../components/ui')>()), toast: vi.fn() }))

import { toast } from '../../components/ui'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card
let clock = 0
let snap: Snapshot

function load(s: Snapshot) {
  useTournament.setState({ tournamentId: 'fixture:minimal4-live', data: dataFromSnapshot(structuredClone(s)), loading: false, error: null, realtime: 'off' })
}

function mount() {
  const fx = getFixture('minimal4-live')!
  snap = structuredClone(fx.snapshot)
  load(snap)
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/minimal4-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
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
/** The strokes stepper's value for the i-th player of the group (p1 = 0). */
const strokesOf = (i: number) => Number(screen.getAllByRole('group', { name: S.strokes })[i]!.textContent?.replace(/\D+/g, ''))
const saveButton = () => screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast})$`) })
async function tapSave(at: number) {
  clock = at
  await act(async () => {
    fireEvent.click(saveButton())
  })
}
const written = () => outbox.scores.map((r) => `${r.player_id}@${r.hole}=${r.strokes}/${r.putts}`)

beforeEach(() => {
  outbox.scores = []
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
    fireEvent.click(screen.getAllByRole('button', { name: `${S.strokes}: más` })[0]!)
    // Meanwhile the other phone saves p3 with a 7 and 3 putts.
    remoteSave('p3', 10, 7, 3)
    expect(strokesOf(2)).toBe(7)
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
    const before = strokesOf(0)
    fireEvent.click(screen.getAllByRole('button', { name: `${S.strokes}: más` })[0]!)
    remoteSave('p1', 10, 9, 2)
    expect(strokesOf(0)).toBe(before + 1)
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
  })

  it('a hole played normally, long after the last save, needs no question', async () => {
    mount()
    await tapSave(11_000)
    await tapSave(11_000 + 4 * 60_000)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(written().filter((r) => r.includes('@11='))).toHaveLength(3)
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

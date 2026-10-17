// @vitest-environment happy-dom
/**
 * The Tarjeta's moments, on the real screen and the `minimal4-live` fixture
 * with the snake on (p1, p3, p4 through hole 9; p2 through 11; the card opens
 * on hole 10). The outbox is mocked the way the phone's own overlay behaves:
 * the boards hold a save as soon as it is queued.
 *
 * MOT-02: a save swapped every value in one frame and the button re-armed at
 * once; a swipe moved nothing until the finger lifted. MOT-07: the scorer
 * who passed the snake saw nothing. MOT-10: no tap, save or moment was felt.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const outbox = vi.hoisted(() => ({
  apply: null as
    null | ((h: { round_id: string; hole: number; entries: import('../../data/outbox').HoleEntry[] }) => void),
}))
vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return {
    ...real,
    enqueueHole: vi.fn(
      async (_tid: string, h: { round_id: string; hole: number; entries: import('../../data/outbox').HoleEntry[] }) =>
        outbox.apply?.(h),
    ),
    enqueueScore: vi.fn(async () => undefined),
    enqueueAward: vi.fn(async () => undefined),
    enqueueTiebreak: vi.fn(async () => undefined),
    enqueueSignature: vi.fn(async () => undefined),
  }
})
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../components/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/toast')>()),
  toast: vi.fn(),
}))

import { applyFields, baseRow, useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { PATTERNS } from '../../lib/haptics'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './tournamentContext'

const S = t.card
let clock = 0
let snap: Snapshot

const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  cancelAnimation.call(this)
}

function load(s: Snapshot) {
  useTournament.setState({
    tournamentId: 'fixture:minimal4-live',
    data: dataFromSnapshot(structuredClone(s)),
    loading: false,
    error: null,
    realtime: 'off',
  })
}

/** The fixture with the snake on and nobody holding it yet: two putts on every hole played. */
function mount() {
  const fx = getFixture('minimal4-live')!
  snap = structuredClone(fx.snapshot)
  const st = snap.tournament.settings as TournamentSettings
  snap.tournament.settings = { ...st, modules: { ...st.modules, snake: { ...st.modules.snake, enabled: true } } }
  for (const s of snap.scores) if (s.putts != null) s.putts = Math.min(2, s.strokes ?? 2)
  load(snap)
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: '_/minimal4-live',
          lookup: fx.lookup,
          me: fx.me,
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <ScorecardScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

const holeOnScreen = () => Number(document.querySelector('[class*="holeNum"]')?.textContent)
const nameOf = (playerId: string) => snap.players.find((p) => p.id === playerId)!.displayName
const puttsUp = (playerId: string) =>
  screen.getByRole('button', { name: `${S.puttsOf(nameOf(playerId))}: ${t.common.stepUp}` })
const saveButton = () => screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast})$`) })
async function tapSave(at: number) {
  clock = at
  await act(async () => {
    fireEvent.click(saveButton())
  })
  await painted()
}
/** The frame after a save is on screen (with these timers, the most the card waits for one): the hole goes out then (PERF-10). */
const painted = () =>
  act(async () => {
    vi.advanceTimersByTime(100)
  })
/** Whose row carries the snake's mark. */
const markedRow = () => {
  const marks = screen.queryAllByRole('img', { name: S.snakeHolder('La Víbora') })
  return marks.map((m) =>
    document.getElementById(m.closest('[role="group"]')!.getAttribute('aria-labelledby')!)!.textContent.trim(),
  )
}
const screenEl = () => document.querySelector('[class*="_screen_"]')!
function drag(dx: number, dy: number, ms: number) {
  const el = screenEl()
  fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 400 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: 300 + dx / 2, clientY: 400 + dy / 2 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: 300 + dx, clientY: 400 + dy }] })
  clock += ms
  act(() => {
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 300 + dx, clientY: 400 + dy }] })
  })
}

beforeEach(() => {
  localStorage.clear()
  useOutbox.setState({ queueRead: true })
  clock = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn(() => true) })
  // The saved hole lands on the boards at once, as the outbox's overlay puts it there.
  outbox.apply = (h) => {
    for (const e of h.entries) {
      const row = applyFields(baseRow(e.base), e.fields)
      snap.scores = snap.scores.filter(
        (x) => !(x.roundId === h.round_id && x.playerId === e.player_id && x.hole === h.hole),
      )
      snap.scores.push({
        roundId: h.round_id,
        playerId: e.player_id,
        hole: h.hole,
        strokes: row.strokes ?? null,
        putts: row.putts ?? null,
        pickedUp: !!row.picked_up,
        enteredBy: 'p1',
        updatedAt: '2027-05-15T16:00:00Z',
      })
    }
    load(snap)
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the snake on the Tarjeta (MOT-07)', () => {
  it('a save that passes the snake marks its new holder and says so, on the screen and to a screen reader', async () => {
    mount()
    expect(holeOnScreen()).toBe(10)
    expect(markedRow()).toEqual([])
    fireEvent.click(puttsUp('p3'))
    await tapSave(20_000)
    expect(holeOnScreen()).toBe(11)
    expect(markedRow()).toEqual([nameOf('p3')])
    expect(screen.getByText(S.snakePasses(nameOf('p3'), 'La Víbora'))).toBeTruthy()
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      `${S.savedHole(10)}. ${S.snakePasses(nameOf('p3'), 'La Víbora')}`,
    )
    // The line goes after a few seconds; the mark stays on his row for the rest of the round.
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.queryByText(S.snakePasses(nameOf('p3'), 'La Víbora'))).toBeNull()
    expect(markedRow()).toEqual([nameOf('p3')])
  })

  it('the next three-putt moves the mark to that row', async () => {
    mount()
    fireEvent.click(puttsUp('p3'))
    await tapSave(20_000)
    fireEvent.click(puttsUp('p4'))
    await tapSave(30_000)
    expect(holeOnScreen()).toBe(12)
    expect(markedRow()).toEqual([nameOf('p4')])
    expect(screen.getByText(S.snakePasses(nameOf('p4'), 'La Víbora'))).toBeTruthy()
  })

  it('a save that leaves the snake where it was says nothing', async () => {
    mount()
    await tapSave(20_000)
    expect(markedRow()).toEqual([])
    expect(screen.queryByText(/La víbora pasa a/)).toBeNull()
  })
})

describe('a save is seen and felt (MOT-02, MOT-10)', () => {
  it('«Guardado» rests on the button a moment, the button keeping its name', async () => {
    mount()
    await tapSave(20_000)
    expect(screen.getByText(S.savedCheck)).toBeTruthy()
    expect(saveButton()).toBeTruthy()
    act(() => void vi.advanceTimersByTime(400))
    expect(screen.queryByText(S.savedCheck)).toBeNull()
  })

  it('a stepper tick, a save and a snake pass each vibrate their own pattern', async () => {
    mount()
    fireEvent.click(puttsUp('p3'))
    expect(vi.mocked(navigator.vibrate)).toHaveBeenLastCalledWith(PATTERNS.tick)
    await tapSave(20_000)
    expect(vi.mocked(navigator.vibrate)).toHaveBeenLastCalledWith(PATTERNS.moment)
    await tapSave(30_000)
    expect(vi.mocked(navigator.vibrate)).toHaveBeenLastCalledWith(PATTERNS.save)
  })

  it('with the switch off in Más, nothing vibrates', async () => {
    localStorage.setItem('cardi-golf:haptics', 'off')
    mount()
    fireEvent.click(puttsUp('p3'))
    await tapSave(20_000)
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })
})

describe('the swipe between holes (MOT-02)', () => {
  it('a long sideways drag goes to the next hole, and back', () => {
    mount()
    drag(-90, 4, 300)
    expect(holeOnScreen()).toBe(11)
    drag(90, -4, 300)
    expect(holeOnScreen()).toBe(10)
  })

  it('a short fast flick goes; a short slow drag springs back', () => {
    mount()
    drag(-40, 2, 400)
    expect(holeOnScreen()).toBe(10)
    drag(-40, 2, 60)
    expect(holeOnScreen()).toBe(11)
  })

  it('a drag that starts downward is the page scrolling, whatever it does after', () => {
    mount()
    const el = screenEl()
    fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 400 }] })
    fireEvent.touchMove(el, { touches: [{ clientX: 302, clientY: 430 }] })
    fireEvent.touchMove(el, { touches: [{ clientX: 200, clientY: 440 }] })
    clock += 200
    act(() => {
      fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200, clientY: 440 }] })
    })
    expect(holeOnScreen()).toBe(10)
  })
})

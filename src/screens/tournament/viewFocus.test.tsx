// @vitest-environment happy-dom
/**
 * A11Y-12: when a view swapped in place, focus fell to <body> with the control
 * that had it: opening a game in Juegos and coming back, the Tarjeta turning to
 * its grid after the last hole, the arrow at the last hole going disabled under
 * the finger. A screen reader was left nowhere, and the next Tab started from
 * the top of the page. Focus now goes to the new view's heading, or, going
 * back, to the control that opened the view.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/outbox')>()
  return { ...real, enqueueHole: vi.fn(async () => undefined), enqueueScore: vi.fn(async () => undefined), enqueueAward: vi.fn(async () => undefined), enqueueTiebreak: vi.fn(async () => undefined), enqueueSignature: vi.fn(async () => undefined) }
})
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

import { useOutbox } from '../../data/outbox'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { GamesScreen } from './GamesScreen'
import { ScorecardScreen } from './ScorecardScreen'
import { TournamentContext } from './TournamentGate'

const S = t.card
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

let snap: Snapshot
function mount(name: string, screenEl: React.ReactNode, edit?: (s: Snapshot) => void) {
  const fx = getFixture(name)!
  snap = structuredClone(fx.snapshot)
  edit?.(snap)
  useTournament.setState({ tournamentId: `fixture:${name}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${name}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        {screenEl}
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** A tap the way a keyboard or a screen reader makes it: focus on the control first. */
function press(el: HTMLElement) {
  el.focus()
  fireEvent.click(el)
}
const painted = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0))))

let clock = 10_000
beforeEach(() => {
  localStorage.clear()
  useOutbox.setState({ queueRead: true })
  // The save's settle guard reads this clock (UX-02): the tap comes well after the card opened.
  clock = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Juegos: a game opened and closed keeps the person’s place (A11Y-12)', () => {
  it('opening a game focuses its heading; back focuses the game’s line in the list', () => {
    mount('full12-live', <GamesScreen />)
    const line = screen.getByRole('button', { name: /^La Víbora/ })
    press(line)
    const heading = screen.getByRole('heading', { level: 1, name: 'La Víbora' })
    expect(document.activeElement).toBe(heading)
    // Focusable by a script, still passed by Tab.
    expect(heading.getAttribute('tabindex')).toBe('-1')
    press(screen.getByRole('button', { name: t.common.back }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^La Víbora/ }))
  })

  it('switching games inside the detail leaves focus on the switch', () => {
    mount('full12-live', <GamesScreen />)
    press(screen.getByRole('button', { name: /^La Víbora/ }))
    const other = screen.getByRole('tab', { name: 'Individual' })
    press(other)
    expect(document.activeElement).toBe(other)
  })
})

describe('Tarjeta: the hole and the grid swap with focus kept (A11Y-12)', () => {
  /** minimal4-live with every hole played: a correction goes back to the grid (UX-19). */
  const allPlayed = (s: Snapshot) => {
    for (const pid of ['p1', 'p2', 'p3', 'p4'])
      for (let h = 1; h <= 18; h++)
        if (!s.scores.some((x) => x.roundId === 'r1' && x.playerId === pid && x.hole === h)) s.scores.push({ roundId: 'r1', playerId: pid, hole: h, strokes: 5, putts: 2, pickedUp: false, enteredBy: 'p1', updatedAt: '2027-05-15T15:00:00Z' })
  }

  it('a save that turns the card to its grid focuses the grid’s heading', async () => {
    mount('minimal4-live', <ScorecardScreen />, allPlayed)
    fireEvent.click(screen.getByRole('button', { name: S.prev }))
    fireEvent.click(screen.getByRole('button', { name: `${S.strokesOf(snap.players.find((p) => p.id === 'p1')!.displayName)}: ${t.common.stepUp}` }))
    clock = 11_000
    await act(async () => {
      press(screen.getByRole('button', { name: new RegExp(`^(${S.save}|${S.saveLast})$`) }))
    })
    await painted()
    expect(screen.getByRole('button', { name: S.holeView })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: S.gridHeading }))
  })

  it('a hole opened from the grid focuses the hole’s heading', () => {
    mount('minimal4-live', <ScorecardScreen />)
    fireEvent.click(screen.getByRole('button', { name: S.grid }))
    press(screen.getByRole('button', { name: `${t.player.hole} 3` }))
    expect(document.querySelector('[class*="holeNum"]')?.textContent).toBe('3')
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('the arrow that goes dead at the last hole hands focus to the other arrow', () => {
    mount('minimal4-live', <ScorecardScreen />, allPlayed)
    // On hole 18 with everything played: back one, then forward with the keyboard's arrow.
    fireEvent.click(screen.getByRole('button', { name: S.prev }))
    const next = screen.getByRole('button', { name: S.next })
    press(next)
    expect((next as HTMLButtonElement).disabled).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: S.prev }))
  })

  it('a control that survives the change keeps focus: the toggle stays where it is', () => {
    mount('minimal4-live', <ScorecardScreen />)
    const toggle = screen.getByRole('button', { name: S.grid })
    press(toggle)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: S.holeView }))
  })
})

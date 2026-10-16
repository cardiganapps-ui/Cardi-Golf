// @vitest-environment happy-dom
/**
 * A11Y-21 (WCAG 2.2.2): the TV moved to the next board every 12 s with no way
 * to stop it, reduced motion included, so a slow reader lost the Calcutta
 * table mid-read. Now «Pausar» (or Space on a keyboard or a clicker) holds the
 * board until «Seguir», and ← → step the boards. Unattended, it rotates.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from './tournamentContext'
import { TvScreen } from './TvScreen'

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

function tv() {
  const fx = getFixture('full12-live')!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <TvScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** Which board is on screen, by the one the footer says comes next (a leaving board can still be in the page). */
const board = () => document.querySelector('footer')!.textContent!.match(/Sigue: ([^]*?)(Pausar|Seguir)$/)![1]
const later = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const key = (k: string) => act(() => void fireEvent.keyDown(window, { key: k }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the room can stop the TV (A11Y-21)', () => {
  it('unattended, it moves on every 12 s', () => {
    tv()
    const first = board()
    later(12_100)
    expect(board()).not.toBe(first)
  })

  it('«Pausar» holds the board until «Seguir», and the footer says so', () => {
    tv()
    const first = board()
    fireEvent.click(screen.getByRole('button', { name: t.tv.pause }))
    expect(screen.getByText(t.tv.paused)).toBeTruthy()
    later(60_000)
    expect(board()).toBe(first)
    fireEvent.click(screen.getByRole('button', { name: t.tv.resume }))
    expect(screen.queryByText(t.tv.paused)).toBeNull()
    // Going on, the board gets its whole time again.
    later(11_000)
    expect(board()).toBe(first)
    later(1_100)
    expect(board()).not.toBe(first)
  })

  it('Space pauses and goes on; the arrows step the boards, paused or not', () => {
    tv()
    const first = board()
    key(' ')
    expect(screen.getByText(t.tv.paused)).toBeTruthy()
    key('ArrowRight')
    const second = board()
    expect(second).not.toBe(first)
    // Still paused on the board it stepped to.
    later(30_000)
    expect(board()).toBe(second)
    key('ArrowLeft')
    expect(board()).toBe(first)
    key(' ')
    expect(screen.queryByText(t.tv.paused)).toBeNull()
  })

  it('Space on the focused button presses it once, not twice', () => {
    tv()
    const pause = screen.getByRole('button', { name: t.tv.pause })
    pause.focus()
    act(() => void fireEvent.keyDown(pause, { key: ' ' }))
    // The keydown is the button's own; the window does not toggle it as well.
    expect(screen.queryByText(t.tv.paused)).toBeNull()
  })
})

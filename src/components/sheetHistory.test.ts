// @vitest-environment happy-dom
/**
 * PWA-05, after the verifier's round on the first version: a back per sheet
 * landed on the next sheet when one closed and another opened in the same
 * render (the Tarjeta's «¿Seguro?» then «¿Quién embocó al último?», Comité ›
 * Campos' import), and StrictMode closed every sheet in dev. One shared entry
 * now stands for «a sheet is open».
 *
 * The history here behaves like a browser's: push and replace are immediate,
 * back is a task that later fires `popstate`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _sheetHistoryTest, leaveSheetHistory, sheetClosed, sheetOpened } from './sheetHistory'

type Fake = ReturnType<typeof fakeHistory>
function fakeHistory() {
  const entries: unknown[] = [{ route: 'page' }]
  let at = 0
  const move = (delta: number) =>
    setTimeout(() => {
      const next = at + delta
      if (next < 0 || next >= entries.length) return
      at = next
      window.dispatchEvent(new Event('popstate'))
    }, 0)
  return {
    entries,
    get at() {
      return at
    },
    get state() {
      return entries[at]
    },
    pushState(state: unknown) {
      entries.splice(at + 1)
      entries.push(state)
      at += 1
    },
    replaceState(state: unknown) {
      entries[at] = state
    },
    back: () => move(-1),
    forward: () => move(1),
  }
}

const isMark = (s: unknown) => !!(s as { poloSheet?: boolean } | null)?.poloSheet
let h: Fake
const realHistory = window.history

beforeEach(() => {
  vi.useFakeTimers()
  _sheetHistoryTest.reset()
  h = fakeHistory()
  Object.defineProperty(window, 'history', { value: h, configurable: true })
})
afterEach(() => {
  _sheetHistoryTest.reset()
  Object.defineProperty(window, 'history', { value: realHistory, configurable: true })
  vi.useRealTimers()
})

describe('one entry for «a sheet is open»', () => {
  it('a sheet that closes as another opens hands its entry over (the «¿Seguro?» → tiebreak case)', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    sheetOpened('a', closeA)
    sheetClosed('a')
    sheetOpened('b', closeB)
    vi.runAllTimers()
    expect(closeB).not.toHaveBeenCalled()
    expect(h.entries).toHaveLength(2)
    expect(h.at).toBe(1)
    expect(isMark(h.state)).toBe(true)
  })

  it('StrictMode (open, close, open) keeps one entry and the sheet open', () => {
    const close = vi.fn()
    sheetOpened('a', close)
    sheetClosed('a')
    sheetOpened('a', close)
    vi.runAllTimers()
    expect(close).not.toHaveBeenCalled()
    expect(h.entries).toHaveLength(2)
    expect(h.at).toBe(1)
  })

  it('back closes the top sheet, then the one under it, then nothing is left behind', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    sheetOpened('a', closeA)
    sheetOpened('b', closeB)
    expect(h.entries).toHaveLength(2)
    h.back()
    vi.runAllTimers()
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
    expect(isMark(h.state)).toBe(true)
    sheetClosed('b')
    h.back()
    vi.runAllTimers()
    expect(closeA).toHaveBeenCalledTimes(1)
    sheetClosed('a')
    vi.runAllTimers()
    expect(h.at).toBe(0)
    expect(isMark(h.state)).toBe(false)
  })

  it('a sheet closed with «Cerrar» gives its entry back, so the next back leaves the screen', () => {
    const close = vi.fn()
    sheetOpened('a', close)
    sheetClosed('a')
    vi.runAllTimers()
    expect(h.at).toBe(0)
    expect(close).not.toHaveBeenCalled()
  })

  it('an entry left behind by a link followed from inside a sheet is stepped over', () => {
    sheetOpened('a', vi.fn())
    // The link navigates (the router pushes), and the sheet goes with the page.
    h.pushState({ route: 'next' })
    sheetClosed('a')
    vi.runAllTimers()
    expect(h.at).toBe(2)
    // One back from the new page lands on the page itself, not on a dead step.
    h.back()
    vi.runAllTimers()
    expect(h.at).toBe(0)
    expect(h.state).toEqual({ route: 'page' })
  })

  it('a reload with a sheet open steps off its entry at start, so the first back leaves the screen', () => {
    // The reload lands on the sheet's entry, with no sheet open any more.
    h.pushState({ route: 'page', poloSheet: true, poloSheetId: 'before-reload' })
    _sheetHistoryTest.boot()
    vi.runAllTimers()
    expect(h.at).toBe(0)
    expect(isMark(h.state)).toBe(false)
  })

  it('forward past an entry that a link inside a sheet buried goes on to the page beyond it', () => {
    // Router entries carry a key; the sheet's entry copies the page's.
    h.replaceState({ route: 'page', key: 'k1' })
    sheetOpened('a', vi.fn())
    h.pushState({ route: 'next', key: 'k2' })
    sheetClosed('a')
    vi.runAllTimers()
    // Back from the next page steps over the buried entry, onto the page.
    h.back()
    vi.runAllTimers()
    expect(h.state).toEqual({ route: 'page', key: 'k1' })
    // Forward from the page goes on to the next page; it used to bounce back to the page.
    h.forward()
    vi.runAllTimers()
    expect(h.state).toEqual({ route: 'next', key: 'k2' })
    // And one back is enough to return.
    h.back()
    vi.runAllTimers()
    expect(h.state).toEqual({ route: 'page', key: 'k1' })
  })

  it('forward onto the entry a closed sheet gave back (nothing beyond it) steps back: forward does nothing', () => {
    h.replaceState({ route: 'page', key: 'k1' })
    sheetOpened('a', vi.fn())
    sheetClosed('a')
    vi.runAllTimers()
    expect(h.at).toBe(0)
    h.forward()
    vi.runAllTimers()
    expect(h.at).toBe(0)
    expect(h.state).toEqual({ route: 'page', key: 'k1' })
  })

  it('leaveSheetHistory gives the entry back first, so a replace lands on the page\'s own entry', async () => {
    sheetOpened('a', vi.fn())
    const left = leaveSheetHistory()
    vi.runAllTimers()
    await left
    expect(h.at).toBe(0)
    h.replaceState({ route: 'list' })
    sheetClosed('a')
    vi.runAllTimers()
    expect(h.at).toBe(0)
    expect(h.entries[0]).toEqual({ route: 'list' })
  })
})

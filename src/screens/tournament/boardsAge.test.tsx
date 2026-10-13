// @vitest-environment happy-dom
/**
 * PERF-09: the «hace N min» clock rendered En vivo's whole board every 30 s,
 * whether its words changed or not. Now the clock moves only when the words
 * would, and only the line that shows them renders.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { savedWhen } from '../../lib/freshness'
import { useSavedWhen } from './boardsAge'

let renders = 0
function Probe({ ts }: { ts: number }) {
  renders++
  return <span data-testid="when">{useSavedWhen(ts)}</span>
}

const T0 = Date.parse('2027-04-09T18:00:00Z')
beforeEach(() => {
  renders = 0
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the boards’ age (PERF-09)', () => {
  it('a tick that changes no word renders nothing; the one that does renders once', () => {
    render(<Probe ts={T0 - 5_000} />)
    const first = screen.getByTestId('when').textContent
    expect(first).toBe(savedWhen(T0 - 5_000, T0))
    const mounted = renders
    // 35 s old: still the same words.
    act(() => void vi.advanceTimersByTime(30_000))
    expect(renders).toBe(mounted)
    expect(screen.getByTestId('when').textContent).toBe(first)
    // 65 s old: a minute now, and the line says so.
    act(() => void vi.advanceTimersByTime(30_000))
    expect(renders).toBe(mounted + 1)
    expect(screen.getByTestId('when').textContent).toBe(savedWhen(T0 - 5_000, T0 + 60_000))
    expect(screen.getByTestId('when').textContent).not.toBe(first)
  })

  it('a fresh fetch reads as fresh at once', () => {
    const { rerender } = render(<Probe ts={T0 - 10 * 60_000} />)
    act(() => void vi.advanceTimersByTime(20_000))
    rerender(<Probe ts={T0 + 20_000} />)
    expect(screen.getByTestId('when').textContent).toBe(savedWhen(T0 + 20_000, T0 + 20_000))
  })
})

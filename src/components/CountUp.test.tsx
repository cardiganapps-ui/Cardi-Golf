// @vitest-environment happy-dom
/**
 * VIS-06 / MOT-23: a Ceremonia figure counts up when it is revealed, waits for
 * its beat, says only the final value to a screen reader, and with reduced
 * motion just shows the value.
 */
import { act, cleanup, render } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVEAL } from '../design/motion'
import { t } from '../i18n/es-MX'
import { CountUp } from './CountUp'

const fmt = (n: number) => `${n} puntos`
const COUNT_MS = REVEAL.countUp * 1000
const seen = (c: HTMLElement) => c.querySelector('[aria-hidden="true"]')!.textContent
const spoken = (c: HTMLElement) => c.querySelector('.sr-only')!.textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

describe('CountUp', () => {
  it('starts at 0, climbs, and lands exactly on the value', () => {
    const { container } = render(<CountUp value={73} format={fmt} />)
    expect(seen(container)).toBe('0 puntos')
    advance(COUNT_MS / 3)
    const mid = parseInt(seen(container)!, 10)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(73)
    advance(COUNT_MS)
    expect(seen(container)).toBe('73 puntos')
  })

  it('waits for its beat before counting', () => {
    const { container } = render(<CountUp value={10000} format={String} delayMs={500} />)
    advance(450)
    expect(seen(container)).toBe('0')
    advance(150 + COUNT_MS / 3)
    expect(Number(seen(container))).toBeGreaterThan(0)
    advance(COUNT_MS)
    expect(seen(container)).toBe('10000')
  })

  it('a screen reader hears the final value from the start, never the numbers flying by', () => {
    const { container } = render(<CountUp value={73} format={fmt} />)
    expect(spoken(container)).toBe('73 puntos')
    advance(COUNT_MS / 2)
    expect(spoken(container)).toBe('73 puntos')
  })

  it('a value that changes mid-count carries on from what is on screen', () => {
    const { container, rerender } = render(<CountUp value={100} format={String} />)
    advance(COUNT_MS / 2)
    const mid = Number(seen(container))
    rerender(<CountUp value={120} format={String} />)
    advance(16)
    expect(Number(seen(container))).toBeGreaterThanOrEqual(mid)
    advance(COUNT_MS)
    expect(seen(container)).toBe('120')
  })

  it('takes the final value\'s width from the first frame, so a step fitted at the reveal still fits when the count ends (VIS-06)', () => {
    const { container } = render(<CountUp value={6600} format={(n) => `$${n.toLocaleString('en-US')}`} />)
    expect(seen(container)).toBe('$0')
    const final = container.querySelector('[data-final]')!
    expect(final.textContent).toBe('$6,600')
    // In the same cell as the figure, unseen and unspoken.
    expect(final.parentElement).toBe(container.querySelector('[aria-hidden="true"]')!.parentElement)
    expect(final.getAttribute('aria-hidden')).toBe('true')
  })

  it('lands on the value itself, not on a rounded one: a match-play champion on 1.5 ends on «1½ puntos», never «2 puntos» (MOT-23)', () => {
    const { container } = render(<CountUp value={1.5} format={t.ceremony.withPoints} />)
    advance(COUNT_MS / 2)
    advance(COUNT_MS)
    expect(seen(container)).toBe('1½ puntos')
    // What the room reads at the end is what a screen reader and reduced motion get.
    expect(seen(container)).toBe(spoken(container))
    expect(seen(container)).toBe(container.querySelector('[data-final]')!.textContent)
  })

  it('a figure that changes to a half mid-count still ends exactly on it', () => {
    const { container, rerender } = render(<CountUp value={3} format={t.ceremony.withPoints} />)
    advance(COUNT_MS / 2)
    rerender(<CountUp value={2.5} format={t.ceremony.withPoints} />)
    advance(COUNT_MS * 2)
    expect(seen(container)).toBe('2½ puntos')
  })

  it('points read as golf writes them: halves as ½, and one point is «punto»', () => {
    const f = t.ceremony.withPoints
    expect([0, 0.5, 1, 1.5, 2, 73].map(f)).toEqual(['0 puntos', '½ punto', '1 punto', '1½ puntos', '2 puntos', '73 puntos'])
  })

  it('with reduced motion the value is there at once', () => {
    const { container } = render(
      <MotionConfig reducedMotion="always">
        <CountUp value={73} format={fmt} delayMs={500} />
      </MotionConfig>,
    )
    expect(seen(container)).toBe('73 puntos')
  })
})

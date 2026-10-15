// @vitest-environment happy-dom
/**
 * The board row (§9.2):
 * - MOT-06: how far it moved since this phone last showed the board, «▲3» under the position, and said.
 * - MOT-18: a figure that changes washes once, and one that changed since the last look washes as the board
 *   opens; Puntos to Gross is no change, and a dash is no figure.
 * - MOT-12: pressed from the first touch, before the click's render (Chrome on Android holds `:active` back).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LeaderRow, type LeaderRowProps } from './primitives'
import s from './primitives.module.css'

afterEach(() => cleanup())

const BASE: LeaderRowProps = { pos: '4', name: 'Camilo', today: '12', thru: '9', figure: '40', speech: { unit: 'points' } }
const row = () => screen.getByRole('button')
const cell = (cls: string) => row().querySelector<HTMLElement>(`.${cls}`)!
const washOf = (cls: string) => cell(cls).dataset.wash

describe('how far the row moved since the last look (MOT-06)', () => {
  it('up three: «3» with the up mark under the position, said with its size', () => {
    render(<LeaderRow {...BASE} movedBy={3} />)
    const mark = cell(s.moved!)
    expect(mark.textContent).toBe('3')
    expect(mark.classList.contains(s.movedUp!)).toBe(true)
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    // Under the position, inside its cell: not a speck at the row's edge.
    expect(mark.parentElement!.classList.contains(s.pos!)).toBe(true)
    expect(row().getAttribute('aria-label')).toBe('4.º, Camilo, 40 puntos, hoy 12 puntos, hoyo 9, subió 3 lugares')
  })

  it('down one, and nothing at all when it did not move', () => {
    const { rerender } = render(<LeaderRow {...BASE} movedBy={-1} />)
    expect(cell(s.moved!).classList.contains(s.movedDown!)).toBe(true)
    expect(row().getAttribute('aria-label')).toMatch(/, bajó 1 lugar$/)
    rerender(<LeaderRow {...BASE} movedBy={0} />)
    expect(row().querySelector(`.${s.moved}`)).toBeNull()
    expect(row().getAttribute('aria-label')).not.toMatch(/lugar/)
  })
})

describe('a changed figure washes (MOT-18)', () => {
  it('a figure that changes on screen washes, and again on the next change; one that stays does not', () => {
    const { rerender } = render(<LeaderRow {...BASE} />)
    expect(washOf(s.figure!)).toBeUndefined()
    expect(washOf(s.today!)).toBeUndefined()
    rerender(<LeaderRow {...BASE} figure="42" today="14" />)
    expect(washOf(s.figure!)).toBe('a')
    expect(washOf(s.today!)).toBe('a')
    // The next change starts the animation again: the other name of the same one.
    rerender(<LeaderRow {...BASE} figure="43" today="14" />)
    expect(washOf(s.figure!)).toBe('b')
    expect(washOf(s.today!)).toBe('a')
    // A render that changes nothing leaves it be.
    rerender(<LeaderRow {...BASE} figure="43" today="14" mine />)
    expect(washOf(s.figure!)).toBe('b')
  })

  it('a figure that changed since the last look washes as the board opens; one that did not, does not', () => {
    render(<LeaderRow {...BASE} seenFigure="38" seenToday="12" />)
    expect(washOf(s.figure!)).toBe('a')
    expect(washOf(s.today!)).toBeUndefined()
  })

  it('no last look (a first look, or a row that had nothing then): nothing washes as it opens', () => {
    render(<LeaderRow {...BASE} />)
    expect(washOf(s.figure!)).toBeUndefined()
  })

  it('another reading of the board (Puntos, Gross) is not a change, either way', () => {
    const { rerender } = render(<LeaderRow {...BASE} reading="points" seenFigure="40" />)
    rerender(<LeaderRow {...BASE} reading="gross" figure="+3" today="E" />)
    expect(washOf(s.figure!)).toBeUndefined()
    rerender(<LeaderRow {...BASE} reading="points" seenFigure="40" />)
    expect(washOf(s.figure!)).toBeUndefined()
    // A real change on that reading still washes.
    rerender(<LeaderRow {...BASE} reading="points" seenFigure="40" figure="41" />)
    expect(washOf(s.figure!)).toBe('a')
  })

  it('a dash or an empty day is no figure: nothing to wash', () => {
    const { rerender } = render(<LeaderRow {...BASE} figure="–" today="" seenFigure="40" seenToday="12" />)
    expect(washOf(s.figure!)).toBeUndefined()
    expect(washOf(s.today!)).toBeUndefined()
    // The day's first hole: from nothing to a figure is a change.
    rerender(<LeaderRow {...BASE} figure="–" today="2" seenFigure="40" seenToday="12" />)
    expect(washOf(s.today!)).toBe('a')
  })
})

describe('pressed from the first touch (MOT-12)', () => {
  it('a touch sets it at once and it stays through the click, until the frame after the finger lifts', async () => {
    let clicks = 0
    render(<LeaderRow {...BASE} onClick={() => clicks++} />)
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true })
    expect(row().dataset.pressed).toBe('')
    fireEvent.pointerUp(row(), { pointerType: 'touch', isPrimary: true })
    fireEvent.click(row())
    expect(clicks).toBe(1)
    expect(row().dataset.pressed).toBe('')
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))
    expect(row().dataset.pressed).toBeUndefined()
  })

  it('a touch that turns into a scroll lets go at once', () => {
    render(<LeaderRow {...BASE} />)
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true })
    fireEvent.pointerCancel(row(), { pointerType: 'touch', isPrimary: true })
    expect(row().dataset.pressed).toBeUndefined()
  })

  it('a drag the page does not scroll for (a pull to refresh) lets go past a tap’s slop; a finger that wobbles keeps it', () => {
    render(<LeaderRow {...BASE} />)
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(row(), { pointerType: 'touch', isPrimary: true, clientX: 104, clientY: 106 })
    expect(row().dataset.pressed).toBe('')
    fireEvent.pointerMove(row(), { pointerType: 'touch', isPrimary: true, clientX: 104, clientY: 130 })
    expect(row().dataset.pressed).toBeUndefined()
  })

  it('a mouse is left to :active, which it gets at once', () => {
    render(<LeaderRow {...BASE} />)
    fireEvent.pointerDown(row(), { pointerType: 'mouse', isPrimary: true })
    expect(row().dataset.pressed).toBeUndefined()
  })
})

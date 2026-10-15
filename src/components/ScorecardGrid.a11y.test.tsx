// @vitest-environment happy-dom
/**
 * A11Y-10: a card's figures reach a screen reader. A mark's label on a plain
 * span replaced the gross («par 3» read for a 4); the rows had no headers; a
 * hole's button said «Hoyo 5» and nothing of the hole.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScoreMark, ScorecardGrid, type GridHole } from './primitives'

afterEach(cleanup)

const holes: GridHole[] = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, par: 4, si: i + 1, gross: i === 0 ? 7 : i === 1 ? 3 : 4, pts: i === 0 ? 0 : i === 1 ? 3 : 2, putts: 2 }))
holes[2] = { ...holes[2]!, gross: null, pickedUp: true, pts: 0 }

describe('a card read aloud (A11Y-10)', () => {
  it('a mark is one image named with its figure and what it is', () => {
    render(<ScoreMark value={7} kind="double" />)
    expect(screen.getByRole('img', { name: '7, doble bogey o peor' })).toBeTruthy()
    cleanup()
    render(<ScoreMark value="L" kind="pickup" />)
    expect(screen.getByRole('img', { name: 'levantó' })).toBeTruthy()
  })

  it('each row has its header, and each hole’s button says the hole whole', () => {
    render(<ScorecardGrid holes={holes} playerLabel="Camilo" showPoints showPutts onHole={vi.fn()} />)
    const headers = screen.getAllByRole('rowheader').map((h) => h.textContent)
    expect(headers).toEqual(['Par', 'SI', 'Camilo', 'Putts', 'Pts'].map((x) => expect.stringContaining(x) as unknown as string))
    expect(screen.getByRole('button', { name: 'Hoyo 1: 7 golpes, doble bogey o peor, 0 puntos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hoyo 2: 3 golpes, birdie, 3 puntos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hoyo 3: levantó, 0 puntos' })).toBeTruthy()
    // The figure inside is the button's, not a second reading.
    expect(within(screen.getByRole('button', { name: /^Hoyo 1:/ })).getByRole('img', { hidden: true })).toBeTruthy()
  })
})

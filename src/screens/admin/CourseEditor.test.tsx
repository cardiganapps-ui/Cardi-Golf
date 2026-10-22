// @vitest-environment happy-dom
/**
 * UX-16: a course started from scratch was eighteen par 4s with the stroke
 * index equal to the hole number. That is a permutation summing to 72, so
 * «Guardar» was on after typing only the course's name, and every stroke and
 * point came from a card nobody typed. Now its cells start empty and the
 * card saves once every par and index is in.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n/es-MX'
import { CourseEditor } from './CourseEditor'
import { blankTee, validateTee } from './courseCells'
import { NOT_TYPED } from './courseCells'

const C = t.admin.courses
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
const SIS = [7, 11, 17, 3, 1, 13, 15, 9, 5, 8, 18, 2, 12, 4, 10, 16, 6, 14]

afterEach(() => cleanup())

function editor(onSave = vi.fn()) {
  render(
    <CourseEditor
      draft={{ name: 'Solmar', tees: [blankTee()] }}
      notes={[]}
      busy={false}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  )
  return onSave
}
const saveButton = () => screen.getByRole('button', { name: t.common.save }) as HTMLButtonElement
const rows = () => screen.getAllByRole('row').slice(1, 19)
const cell = (hole: number, label: (n: number) => string) =>
  within(rows()[hole - 1]!).getByLabelText(label(hole)) as HTMLInputElement

describe('a card started from scratch (UX-16)', () => {
  it('opens with every par and index empty, and will not save', () => {
    editor()
    expect(rows().map((_, i) => [cell(i + 1, C.parOf).value, cell(i + 1, C.siOf).value])).toEqual(
      PARS.map(() => ['', '']),
    )
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText(`Azules: ${C.holesUntyped(PARS.map((_, i) => i + 1))}`)).toBeTruthy()
  })

  it('saves once the card is pasted in, with what was pasted', async () => {
    const onSave = editor()
    await act(async () =>
      fireEvent.change(screen.getByPlaceholderText(/^4 4 3 5/), {
        target: { value: `${PARS.join(' ')}\n${SIS.join(' ')}` },
      }),
    )
    await act(async () => fireEvent.click(screen.getByRole('button', { name: C.pasteApply })))
    expect(saveButton().disabled).toBe(false)
    await act(async () => fireEvent.click(saveButton()))
    const saved = onSave.mock.calls[0]![0] as { tees: Array<{ holes: Array<{ par: number; strokeIndex: number }> }> }
    expect(saved.tees[0]!.holes.map((h) => [h.par, h.strokeIndex])).toEqual(PARS.map((p, i) => [p, SIS[i]]))
  })

  it('one hole still to type keeps it from saving, and says which', async () => {
    editor()
    for (let h = 1; h <= 18; h++) {
      await act(async () => fireEvent.change(cell(h, C.parOf), { target: { value: String(PARS[h - 1]) } }))
      if (h !== 12) await act(async () => fireEvent.change(cell(h, C.siOf), { target: { value: String(SIS[h - 1]) } }))
    }
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText(`Azules: ${C.holesUntyped([12])}`)).toBeTruthy()
    await act(async () => fireEvent.change(cell(12, C.siOf), { target: { value: String(SIS[11]) } }))
    expect(saveButton().disabled).toBe(false)
  })
})

describe('validateTee', () => {
  it('a blank tee is missing its cells, said once, before anything else is judged', () => {
    expect(validateTee(blankTee())).toEqual([C.holesUntyped(PARS.map((_, i) => i + 1))])
    expect(blankTee().holes.every((h) => h.par === NOT_TYPED && h.strokeIndex === NOT_TYPED)).toBe(true)
  })

  it('a whole card is judged as before: repeated indexes are still caught', () => {
    const tee = {
      ...blankTee(),
      holes: PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: SIS[i]!, yards: null })),
    }
    expect(validateTee(tee)).toEqual([])
    tee.holes[0] = { ...tee.holes[0]!, strokeIndex: 2 }
    expect(validateTee(tee)).toEqual([C.siNotPermutation])
  })
})

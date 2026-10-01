// @vitest-environment happy-dom
/**
 * UX-01: in a Comité sheet only the first typed character stuck (13 → 1,
 * «Camilo» → «C»). Every keystroke re-rendered the parent, whose inline
 * `onClose` re-ran the sheet's open/close effect, and its cleanup moved focus
 * back to the opener. These tests type at human speed into a sheet whose
 * parent re-renders on every change, the way every Comité form does.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { NumberField } from './NumberField'
import { Sheet } from './ui'

function ComiteForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [hcp, setHcp] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Editar jugador
      </button>
      <output data-testid="saved">{`${name}|${hcp}`}</output>
      {/* An inline onClose: a new function on every render, as in the real screens. */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Jugador">
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <NumberField label="Hándicap" value={hcp} onChange={setHcp} max={54} />
      </Sheet>
    </>
  )
}

afterEach(cleanup)

describe('Sheet', () => {
  it('keeps every character typed at human speed', async () => {
    const user = userEvent.setup({ delay: 100 })
    render(<ComiteForm />)
    await user.click(screen.getByRole('button', { name: 'Editar jugador' }))
    await act(() => new Promise((r) => setTimeout(r, 50)))

    await user.click(screen.getByRole('textbox', { name: 'Nombre' }))
    await user.keyboard('Camilo Duarte')
    await user.click(screen.getByRole('textbox', { name: 'Hándicap' }))
    await user.keyboard('13')

    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveProperty('value', 'Camilo Duarte')
    expect(screen.getByTestId('saved').textContent).toBe('Camilo Duarte|13')
    // Focus never left the sheet while typing.
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('closes with Escape through the latest onClose and returns focus to the opener', async () => {
    const user = userEvent.setup({ delay: 20 })
    render(<ComiteForm />)
    const opener = screen.getByRole('button', { name: 'Editar jugador' })
    await user.click(opener)
    await user.click(screen.getByRole('textbox', { name: 'Nombre' }))
    await user.keyboard('Ana')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

// @vitest-environment happy-dom
/**
 * UX-15: a stray tap on the strip above a sheet, Escape or «Cerrar» closed it
 * and silently dropped what was typed (27 cells of a scorecard, a photo's
 * read, a player). A sheet with work in it (`dirty`) asks first, in a sheet
 * of its own; one with nothing typed still closes at once.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { Sheet } from './ui'

function Form() {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState('')
  return (
    <>
      <output data-testid="open">{String(open)}</output>
      <Sheet open={open} onClose={() => setOpen(false)} title="Jugador" dirty={name !== ''}>
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </Sheet>
    </>
  )
}
const isOpen = () => screen.getByTestId('open').textContent === 'true'
const backdrop = () => document.querySelector('[role="presentation"]') as HTMLElement
const ask = () => screen.queryByRole('dialog', { name: t.common.discardTitle })

afterEach(cleanup)

describe('Sheet with typed work (UX-15)', () => {
  it('with nothing typed, the backdrop closes it at once', () => {
    render(<Form />)
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(false)
  })

  it('with something typed, the backdrop asks; «Seguir capturando» keeps the sheet and what was typed', async () => {
    render(<Form />)
    await userEvent.type(screen.getByLabelText('Nombre'), 'Camilo')
    fireEvent.click(backdrop())
    expect(isOpen()).toBe(true)
    expect(ask()).toBeTruthy()
    fireEvent.click(within(ask()!).getByRole('button', { name: t.common.keepEditing }))
    expect(ask()).toBeNull()
    expect(isOpen()).toBe(true)
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Camilo')
  })

  it('«Cerrar» and Escape ask too; «Descartar» closes it', async () => {
    render(<Form />)
    await userEvent.type(screen.getByLabelText('Nombre'), 'C')
    const sheet = screen.getByRole('dialog', { name: 'Jugador' })
    fireEvent.click(within(sheet).getByRole('button', { name: t.common.close }))
    expect(ask()).toBeTruthy()
    fireEvent.click(within(ask()!).getByRole('button', { name: t.common.keepEditing }))
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(ask()).toBeTruthy()
    expect(isOpen()).toBe(true)
    fireEvent.click(within(ask()!).getByRole('button', { name: t.common.discard }))
    expect(isOpen()).toBe(false)
  })

  it('a tap on the question’s own backdrop keeps editing, never closes the sheet under it', async () => {
    render(<Form />)
    await userEvent.type(screen.getByLabelText('Nombre'), 'C')
    fireEvent.click(backdrop())
    const backdrops = document.querySelectorAll('[role="presentation"]')
    fireEvent.click(backdrops[backdrops.length - 1] as HTMLElement)
    expect(ask()).toBeNull()
    expect(isOpen()).toBe(true)
  })
})

// @vitest-environment happy-dom
/**
 * A11Y-03: a sheet said `aria-modal`, but Tab walked out of it into the page
 * and the tab bar behind (23 of 80 presses on the player sheet), and a screen
 * reader could read the covered page. While a sheet is open the page around
 * it is inert, Tab and Shift+Tab go round inside it, Escape closes the top one
 * and focus returns to what opened it. The status regions stay live.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { Sheet, Toaster } from './ui'
import { _modalFocusTest } from './modalFocus'

function Page({ nested = false }: { nested?: boolean }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <header>
        <button type="button">Atrás de la hoja</button>
      </header>
      <main>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir jugador
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Jugador">
          <label>
            Nombre
            <input />
          </label>
          <button type="button" onClick={() => setInner(true)}>
            Guardar
          </button>
          {nested && (
            <Sheet open={inner} onClose={() => setInner(false)} title="¿Seguro?">
              <button type="button">Sí</button>
              <button type="button" onClick={() => setInner(false)}>
                No
              </button>
            </Sheet>
          )}
        </Sheet>
      </main>
      <nav aria-label="Secciones">
        <a href="/t/x">En vivo</a>
        <a href="/t/x/juegos">Juegos</a>
      </nav>
      <Toaster />
    </>
  )
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 50)))
const inDialog = (name: string) => screen.getByRole('dialog', { name }).contains(document.activeElement)

afterEach(() => {
  cleanup()
  _modalFocusTest.reset()
})

describe('a sheet is modal for the keyboard (A11Y-03)', () => {
  it('makes everything around it inert while it is open, except the status regions, and gives it all back on close', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Abrir jugador' }))
    await settle()
    const sheet = screen.getByRole('dialog', { name: 'Jugador' })
    expect(sheet.closest('[inert]')).toBeNull()
    expect(document.querySelector('header')!.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('nav')!.hasAttribute('inert')).toBe(true)
    // The opener's own row, beside the sheet in the same branch, too.
    expect(screen.getByRole('button', { name: 'Abrir jugador', hidden: true }).hasAttribute('inert')).toBe(true)
    // A toast said while the sheet is open is still heard.
    expect(document.querySelector('[aria-live]')!.closest('[inert]')).toBeNull()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelectorAll('[inert]')).toHaveLength(0)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir jugador' }))
  })

  it('Tab and Shift+Tab go round inside it, never to the page or the tab bar behind', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Abrir jugador' }))
    await settle()
    const sheet = screen.getByRole('dialog', { name: 'Jugador' })
    const stops = [
      within(sheet).getByRole('button', { name: t.common.close }),
      within(sheet).getByRole('textbox', { name: 'Nombre' }),
      within(sheet).getByRole('button', { name: 'Guardar' }),
    ]
    // Focus starts on the sheet itself.
    expect(document.activeElement).toBe(sheet)
    const seen: Element[] = []
    for (let i = 0; i < 10; i++) {
      await user.tab()
      seen.push(document.activeElement!)
      expect(inDialog('Jugador')).toBe(true)
    }
    // Round and round in order: «Cerrar», the field, «Guardar», and back to «Cerrar».
    expect(seen.slice(0, 4)).toEqual([...stops, stops[0]])
    // Backwards from the first goes to the last.
    stops[0]!.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(stops[2])
    for (let i = 0; i < 10; i++) {
      await user.tab({ shift: true })
      expect(inDialog('Jugador')).toBe(true)
    }
  })

  it('Shift+Tab from the sheet itself, where focus lands when it opens, goes to its last stop', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Abrir jugador' }))
    await settle()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guardar' }))
  })

  it('a sheet inside a sheet: the first one goes inert around the second, Escape closes only the second, and focus comes back to its opener', async () => {
    const user = userEvent.setup()
    render(<Page nested />)
    await user.click(screen.getByRole('button', { name: 'Abrir jugador' }))
    await settle()
    const save = screen.getByRole('button', { name: 'Guardar' })
    await user.click(save)
    await settle()
    const question = screen.getByRole('dialog', { name: '¿Seguro?' })
    expect(question.closest('[inert]')).toBeNull()
    expect(save.hasAttribute('inert')).toBe(true)
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(inDialog('¿Seguro?')).toBe(true)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '¿Seguro?' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Jugador' })).toBeTruthy()
    // The first sheet is live again, the page behind it still inert.
    expect(save.closest('[inert]')).toBeNull()
    expect(document.querySelector('nav')!.hasAttribute('inert')).toBe(true)
    expect(document.activeElement).toBe(save)
  })
})

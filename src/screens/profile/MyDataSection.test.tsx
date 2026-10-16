// @vitest-environment happy-dom
/**
 * TRUST-09: a person had no way to get his data or to leave without writing to the operator. Editar perfil now
 * downloads everything as one file and deletes the account once its email is typed, saying first what goes and
 * what stays; refused, in words, while this phone holds writes nobody else can send.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n/es-MX'

const api = vi.hoisted(() => ({
  downloadMyData: vi.fn(async () => undefined),
  myDeletePreview: vi.fn(async () => ({ orphaned: [{ id: 't1', name: 'Copa del Jueves' }], anonymizedPlayers: 2, anonymizedIn: ['Ensayo', 'Copa del Jueves'], crewsHanded: ['Los jueves'], crewsDeleted: [] })),
  deleteMyAccount: vi.fn(async (_email: string): Promise<{ done: true } | { done: false; reason: string }> => ({ done: true })),
}))
vi.mock('../../data/myData', () => api)
const { MyDataSection } = await import('./MyDataSection')

const D = t.profile.myData
const EMAIL = 'ana@polo.test'
beforeEach(() => {
  for (const f of Object.values(api)) f.mockClear()
})
afterEach(cleanup)

function mount() {
  return render(
    <MemoryRouter initialEntries={['/perfil/editar']}>
      <Routes>
        <Route path="/perfil/editar" element={<MyDataSection email={EMAIL} />} />
        <Route path="/" element={<p>Inicio</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('«Tus datos» (TRUST-09)', () => {
  it('«Descargar mis datos» downloads the file', async () => {
    mount()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.download })))
    expect(api.downloadMyData).toHaveBeenCalledTimes(1)
  })

  it('«Borrar mi cuenta» says what goes and what stays, from the server, before anything is deleted', async () => {
    mount()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.delete })))
    expect(await screen.findByText(D.deletePlayers(2, ['Ensayo', 'Copa del Jueves']))).toBeTruthy()
    expect(screen.getByText(D.deleteOrphaned(['Copa del Jueves']))).toBeTruthy()
    expect(screen.getByText(D.deleteCrewsHanded(['Los jueves']))).toBeTruthy()
    expect(screen.getByText(D.deleteKept)).toBeTruthy()
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
  })

  it('a wrong email deletes nothing; the right one (any case) deletes and goes home', async () => {
    mount()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.delete })))
    const field = screen.getByLabelText(D.confirmEmail(EMAIL))
    fireEvent.change(field, { target: { value: 'otra@polo.test' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.deleteConfirm })))
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: ' ANA@polo.test ' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.deleteConfirm })))
    expect(api.deleteMyAccount).toHaveBeenCalledWith('ANA@polo.test')
    expect(await screen.findByText('Inicio')).toBeTruthy()
  })

  it('refused while this phone holds writes: the reason is said, and nothing changes', async () => {
    api.deleteMyAccount.mockResolvedValueOnce({ done: false, reason: 'Lo capturado en Ensayo aún no se sube.' })
    mount()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.delete })))
    fireEvent.change(screen.getByLabelText(D.confirmEmail(EMAIL)), { target: { value: EMAIL } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: D.deleteConfirm })))
    expect(await screen.findByText('Lo capturado en Ensayo aún no se sube.')).toBeTruthy()
    expect(screen.queryByText('Inicio')).toBeNull()
  })
})

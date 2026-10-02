// @vitest-environment happy-dom
/**
 * Mis torneos signs out the same way as everywhere else (the verifier of #87,
 * mutant N27): through `signOutSafely`, which refuses while writes are still
 * on the phone, signs out only when the session can really go, and takes the
 * boards saved on the phone with it. A plain sign-out here skipped all three.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const account = vi.hoisted(() => ({ signOutSafely: vi.fn() }))
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => true) }))
vi.mock('../../data/account', () => ({ signOutSafely: account.signOutSafely }))
vi.mock('../../data/auth', () => ({
  useAuth: () => ({ ready: true, user: { id: 'uid-organizer' }, isAnonymous: false }),
  signOut: auth.signOut,
}))
vi.mock('../../data/api', () => ({ listMyTournaments: async () => [] }))
vi.mock('../../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))

import { Toaster } from '../../components/ui'
import { t } from '../../i18n/es-MX'
import { MyTournamentsScreen } from './MyTournamentsScreen'

function open() {
  return render(
    <MemoryRouter initialEntries={['/organizer']}>
      <Toaster />
      <Routes>
        <Route path="/organizer" element={<MyTournamentsScreen />} />
        <Route path="/" element={<p>Inicio</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
afterEach(() => {
  cleanup()
  account.signOutSafely.mockReset()
  auth.signOut.mockClear()
})

describe('«Cerrar sesión» in Mis torneos', () => {
  it('goes through the guarded sign-out, and home once it is done', async () => {
    account.signOutSafely.mockResolvedValue({ done: true })
    open()
    fireEvent.click(await screen.findByRole('button', { name: t.common.logout }))
    expect(await screen.findByText('Inicio')).toBeTruthy()
    expect(account.signOutSafely).toHaveBeenCalledTimes(1)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('refused (a hole still on the phone, or no signal to end the session): says why and stays', async () => {
    const reason = t.account.unsentSignal('Nacho’s Bachelor', 'signOut')
    account.signOutSafely.mockResolvedValue({ done: false, reason })
    open()
    fireEvent.click(await screen.findByRole('button', { name: t.common.logout }))
    expect(await screen.findByText(reason)).toBeTruthy()
    expect(screen.queryByText('Inicio')).toBeNull()
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})

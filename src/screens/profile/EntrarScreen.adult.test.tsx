// @vitest-environment happy-dom
/**
 * TRUST-13: an account is for adults. /entrar's every way in (the emailed code, Google) waits for «Confirmo que
 * tengo 18 años o más», and marks it on the phone so the acceptance after the sign-in records it (confirm_adult).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const account = vi.hoisted(() => ({
  googleAvailable: vi.fn(async () => true),
  sendProfileCode: vi.fn(async (_email: string) => 'signin' as const),
  continueWithGoogle: vi.fn(async (_next: string) => undefined),
}))
vi.mock('../../data/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/account')>()),
  ...account,
}))
vi.mock('../../data/profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/profiles')>()),
  myDeviceClaim: async () => null,
}))

import { useAuth } from '../../data/auth'
import { t } from '../../i18n/es-MX'
const { EntrarScreen } = await import('./EntrarScreen')

beforeEach(() => {
  localStorage.clear()
  for (const f of Object.values(account)) f.mockClear()
  useAuth.setState({ ready: true, user: null, isAnonymous: false })
})
afterEach(cleanup)

const check = () => screen.getByRole('checkbox', { name: new RegExp(t.legal.adult.check) })

describe('/entrar asks the age first (TRUST-13)', () => {
  it('the code and Google wait for it, saying so', async () => {
    render(
      <MemoryRouter>
        <EntrarScreen />
      </MemoryRouter>,
    )
    const google = await screen.findByRole('button', { name: new RegExp(t.account.google) })
    fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: 'ana@polo.test' } })
    const send = screen.getByRole('button', { name: t.account.sendCode }) as HTMLButtonElement
    // Both stay in reach (and in the keyboard's order); without the check they say what is missing and send nothing.
    await act(async () => fireEvent.click(send))
    expect(screen.getByRole('alert').textContent).toBe(t.legal.adult.needed)
    await act(async () => fireEvent.click(google))
    expect(account.sendProfileCode).not.toHaveBeenCalled()
    expect(account.continueWithGoogle).not.toHaveBeenCalled()
    fireEvent.click(check())
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => fireEvent.click(send))
    expect(account.sendProfileCode).toHaveBeenCalledWith('ana@polo.test')
    expect(JSON.parse(localStorage.getItem('cardi-golf:legal')!).adult.at).toBeGreaterThan(0)
  })

  it('Google, once checked, carries it across the round trip', async () => {
    render(
      <MemoryRouter>
        <EntrarScreen />
      </MemoryRouter>,
    )
    const google = await screen.findByRole('button', { name: new RegExp(t.account.google) })
    fireEvent.click(check())
    await act(async () => fireEvent.click(google))
    expect(account.continueWithGoogle).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('cardi-golf:legal')!).adult.at).toBeGreaterThan(0)
  })
})

// @vitest-environment happy-dom
/**
 * A sign-out that ends after its screen said the person was still signed in
 * (the verifier of #87, round 3): the session went at 12 s on lie-fi and the
 * previous person's boards stayed on screen for the next one. Once account.ts
 * has cleared what the phone kept, the shell takes the phone home and says so.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { Toaster } from '../components/ui'
import { useLateSignOut } from '../data/account'
import { t } from '../i18n/es-MX'
import { LateSignOutHome } from './LateSignOut'

function open() {
  return render(
    <MemoryRouter initialEntries={['/t/nacho/mas']}>
      <LateSignOutHome />
      <Toaster />
      <Routes>
        <Route path="/t/:slug/mas" element={<p>Más de Nacho</p>} />
        <Route path="/" element={<p>Inicio</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
afterEach(() => {
  cleanup()
  useLateSignOut.setState({ at: null })
})

describe('a sign-out that ended late', () => {
  it('takes the phone home from wherever it is, and says the session ended and the phone was cleared', async () => {
    open()
    expect(screen.getByText('Más de Nacho')).toBeTruthy()
    act(() => useLateSignOut.setState({ at: Date.now() }))
    expect(await screen.findByText('Inicio')).toBeTruthy()
    expect(screen.queryByText('Más de Nacho')).toBeNull()
    expect(screen.getByText(t.account.signedOutLate)).toBeTruthy()
    // Once: the next time the shell mounts, nothing happens again.
    expect(useLateSignOut.getState().at).toBeNull()
  })

  it('with no late sign-out, nothing moves', () => {
    open()
    expect(screen.getByText('Más de Nacho')).toBeTruthy()
    expect(screen.queryByText(t.account.signedOutLate)).toBeNull()
  })
})

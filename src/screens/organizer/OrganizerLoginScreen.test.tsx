// @vitest-environment happy-dom
/**
 * «Organizar un torneo» signs the phone in to another account, like the three
 * switches in account.ts (the verifier of #87, round 3): an anonymous phone
 * with a hole still to send signed in as the organizer with email and
 * password, and the hole was left waiting for a PIN. It is refused the same
 * way now, with the same words, before any session changes or email goes out.
 */
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** What reached auth-js: none of it may while a write waits. */
const sb = vi.hoisted(() => ({ signIns: 0, signUps: 0, codes: 0, verifies: 0 }))
vi.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  authSettings: async () => null,
  supabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithPassword: async () => {
        sb.signIns++
        return { error: null }
      },
      signUp: async () => {
        sb.signUps++
        return { data: { session: null }, error: null }
      },
      signInWithOtp: async () => {
        sb.codes++
        return { error: null }
      },
      verifyOtp: async () => {
        sb.verifies++
        return { error: null }
      },
    },
  }),
}))

import { useAuth } from '../../data/auth'
import { _outboxTest } from '../../data/outbox'
import { t } from '../../i18n/es-MX'
import { OrganizerLoginScreen } from './OrganizerLoginScreen'

function open() {
  return render(
    <MemoryRouter initialEntries={['/organizer/login']}>
      <Routes>
        <Route path="/organizer/login" element={<OrganizerLoginScreen />} />
        <Route path="/organizer" element={<p>Mis torneos</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
/** A hole this anonymous phone saved in Nacho's tournament, still waiting for signal. */
function holeOnThePhone() {
  return _outboxTest.enqueue({
    key: 'score:r1:p9:12',
    kind: 'score',
    tournamentId: 't-nacho',
    tournamentName: 'Nacho',
    payload: { round_id: 'r1', player_id: 'p9', hole: 12, strokes: 5, putts: 2, picked_up: false, entered_by: 'p9', client_ts: 'x' },
    attempts: 0,
    createdAt: 1,
  })
}
/** The form's inputs, by what they hold. */
const INPUT = { email: 'input[type="email"]', password: 'input[type="password"]', name: 'input[autocomplete="name"]', code: 'input[autocomplete="one-time-code"]' }
const fill = (which: keyof typeof INPUT, value: string) => fireEvent.change(document.querySelector(INPUT[which])!, { target: { value } })
const refusal = t.account.unsentSignal('Nacho', 'switch')

beforeEach(async () => {
  Object.assign(sb, { signIns: 0, signUps: 0, codes: 0, verifies: 0 })
  useAuth.setState({ ready: true, user: { id: 'uid-anon', is_anonymous: true } as never, isAnonymous: true })
  _outboxTest.reset()
  await _outboxTest.clearStored()
  _outboxTest.setPush(async () => {
    throw new Error('TypeError: Failed to fetch')
  })
})
afterEach(() => cleanup())

describe('«Organizar un torneo» with a hole still on the phone', () => {
  it('email and password: refused, saying which tournament and why, and nobody is signed in', async () => {
    await holeOnThePhone()
    open()
    fill('email', 'organiza@example.com')
    fill('password', 'secreto123')
    fireEvent.click(screen.getByRole('button', { name: t.auth.signIn }))
    expect((await screen.findByRole('alert')).textContent).toBe(refusal)
    expect(sb.signIns).toBe(0)
    expect(screen.queryByText('Mis torneos')).toBeNull()
    expect(_outboxTest.queue()).toHaveLength(1)
  })

  it('a new account and the emailed code are refused before any email goes out', async () => {
    await holeOnThePhone()
    open()
    fill('email', 'organiza@example.com')
    fireEvent.click(screen.getByRole('button', { name: t.auth.magicLink }))
    expect((await screen.findByRole('alert')).textContent).toBe(refusal)
    fireEvent.click(screen.getByRole('button', { name: t.auth.toggleToSignUp }))
    fill('name', 'Organiza')
    fill('password', 'secreto123')
    fireEvent.click(screen.getByRole('button', { name: t.auth.signUp }))
    expect((await screen.findByRole('alert')).textContent).toBe(refusal)
    expect(sb.codes + sb.signUps).toBe(0)
  })

  it('the code that would switch the phone: a hole saved meanwhile refuses it too', async () => {
    open()
    fill('email', 'organiza@example.com')
    fireEvent.click(screen.getByRole('button', { name: t.auth.magicLink }))
    await screen.findByText(t.auth.magicSent)
    expect(sb.codes).toBe(1)
    await holeOnThePhone()
    fill('code', '123456')
    fireEvent.click(screen.getByRole('button', { name: t.auth.confirmCode }))
    expect((await screen.findByRole('alert')).textContent).toBe(refusal)
    expect(sb.verifies).toBe(0)
  })

  it('with nothing left to send, it signs in as before', async () => {
    open()
    fill('email', 'organiza@example.com')
    fill('password', 'secreto123')
    fireEvent.click(screen.getByRole('button', { name: t.auth.signIn }))
    expect(await screen.findByText('Mis torneos')).toBeTruthy()
    expect(sb.signIns).toBe(1)
  })
})

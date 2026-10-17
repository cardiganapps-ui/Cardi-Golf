// @vitest-environment happy-dom
/**
 * STRAT-05: a link to watch (`/v/<token>`) is nobody's phone. The shell starts
 * there neither the outbox (whose IndexedDB it would open) nor the session (and
 * with it the profile, the inbox and the badge); the app's switches still load
 * (a public read that writes nothing: the maintenance banner and the build to
 * update to). Leaving the link for a screen of the app starts both.
 */
import { act, cleanup, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const startOutbox = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../data/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/outbox')>()),
  startOutbox,
}))
const flags = vi.hoisted(() => vi.fn(async () => undefined))

const { AppShell } = await import('./AppShell')
const { useAuth } = await import('../data/auth')
const { useAppFlags } = await import('../data/platform')

const init = vi.fn(async () => undefined)
beforeEach(() => {
  useAuth.setState({ init })
  useAppFlags.setState({ load: flags })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open(at: string) {
  const router = createMemoryRouter([{ element: <AppShell />, children: [{ path: '*', element: <p>pantalla</p> }] }], {
    initialEntries: [at],
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('the shell on a link to watch (STRAT-05)', () => {
  for (const at of [
    '/v/0EGCoHWzowIk4PgecAWI9b15',
    '/V/0EGCoHWzowIk4PgecAWI9b15',
    '/v/0EGCoHWzowIk4PgecAWI9b15/',
    '/v/0EGCoHWzowIk4PgecAWI9b15/tv',
    '/v/_/full12-live/juegos',
    '/v/_dinero/full12-live/dinero',
  ]) {
    it(`${at}: no outbox and no session, only the app's switches`, () => {
      open(at)
      expect(startOutbox).not.toHaveBeenCalled()
      expect(init).not.toHaveBeenCalled()
      expect(flags).toHaveBeenCalledTimes(1)
    })
  }

  it('a screen of the app starts both, also after a link', async () => {
    const router = open('/v/0EGCoHWzowIk4PgecAWI9b15')
    expect(startOutbox).not.toHaveBeenCalled()
    await act(() => router.navigate('/'))
    expect(startOutbox).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledTimes(1)
    cleanup()
    vi.clearAllMocks()
    open('/t/nacho')
    expect(startOutbox).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledTimes(1)
  })
})

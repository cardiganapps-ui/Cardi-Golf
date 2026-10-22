// @vitest-environment happy-dom
/**
 * REL-13: while the page loads the new build after a deploy, the screen that
 * failed to load stays blank instead of flashing «Algo falló al abrir Polo»,
 * and is not reported as a crash. Any other failure still is both.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n/es-MX'

const reported = vi.fn()
vi.mock('../lib/telemetry', () => ({ reportError: (...args: unknown[]) => reported(...args) }))
let reloading = false
vi.mock('../lib/chunkReload', () => ({ reloadingForNewBuild: () => reloading }))
const { RouteError } = await import('./RouteError')

/** A screen whose chunk the server no longer has. */
function Gone(): never {
  throw new TypeError(
    'Failed to fetch dynamically imported module: https://golf.cardigan.mx/assets/StatsScreen-DKzuE5NK.js',
  )
}
const show = () =>
  render(
    <RouterProvider router={createMemoryRouter([{ path: '/', element: <Gone />, errorElement: <RouteError /> }])} />,
  )

afterEach(() => {
  cleanup()
  reported.mockReset()
  reloading = false
  vi.restoreAllMocks()
})

describe('the route error screen during a deploy (REL-13)', () => {
  it('while the page loads the new build: blank, and no crash reported', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reloading = true
    const { container } = show()
    expect(container.textContent).toBe('')
    expect(reported).not.toHaveBeenCalled()
  })

  it('any other failure: the crash screen, reported', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    show()
    expect(screen.getByRole('heading', { name: t.boot.crashTitle })).toBeTruthy()
    expect(reported).toHaveBeenCalledWith('route_error', expect.any(TypeError))
  })
})

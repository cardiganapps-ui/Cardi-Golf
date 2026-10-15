// @vitest-environment happy-dom
/**
 * STRAT-05: a link to watch (`/v/<token>`) is nobody's phone. Telemetry never
 * starts there (no device id kept, no event queued, no vitals), and a page
 * that started it on a screen of its own logs nothing once it is on a link.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const getSession = vi.fn()
vi.mock('./supabase', () => ({ supabaseConfigured: true, supabase: () => ({ rpc, auth: { getSession } }) }))

const tel = await import('./telemetry')
const ours = () => Object.keys(localStorage).filter((k) => k.startsWith('cardi-golf:'))

beforeEach(() => {
  vi.useFakeTimers()
  rpc.mockResolvedValue({ data: 1, error: null })
  getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
  localStorage.clear()
  tel.resetTelemetryForTests(false)
})
afterEach(() => {
  tel.resetTelemetryForTests(false)
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

describe('telemetry on a link to watch (STRAT-05)', () => {
  for (const at of ['/v/0EGCoHWzowIk4PgecAWI9b15', '/V/0EGCoHWzowIk4PgecAWI9b15', '/v/0EGCoHWzowIk4PgecAWI9b15/tv/']) it(`never starts at ${at}: no device id, nothing queued, nothing sent`, async () => {
    history.replaceState(null, '', at)
    tel.startTelemetry({ PROD: true, MODE: 'production' })
    tel.step('app_open')
    tel.reportError('window.error', new TypeError('boom'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(tel.queuedEvents()).toEqual([])
    expect(ours()).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('started on a screen of its own, it logs nothing once the page is on a link, and names no link as its tournament', async () => {
    history.replaceState(null, '', '/t/nacho')
    tel.startTelemetry({ PROD: true, MODE: 'production' })
    const before = tel.queuedEvents().length
    expect(before).toBeGreaterThan(0)
    history.replaceState(null, '', '/v/0EGCoHWzowIk4PgecAWI9b15/tv')
    tel.setTelemetryTournament('spectator:abc')
    tel.step('tournament_open', { once: true })
    tel.track('vital', 'lcp', 1200)
    tel.reportError('window.error', new TypeError('boom'))
    expect(tel.queuedEvents()).toHaveLength(before)
    history.replaceState(null, '', '/t/nacho')
    tel.step('tournament_open')
    expect(tel.queuedEvents().at(-1)).toMatchObject({ name: 'tournament_open', tournamentId: null })
  })
})

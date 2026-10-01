// @vitest-environment happy-dom
/**
 * Audit P1-15 / QA-07: Realtime does not replay what a phone missed while it
 * had no signal or sat in a pocket, so the store reloads the open tournament
 * when the signal comes back and when the app is shown again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './testing/fakeSupabase'

const server = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament } = await import('./tournamentStore')

let visibility: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })

describe('reload when the phone comes back (audit P1-15)', () => {
  let reloads = 0
  beforeEach(() => {
    reloads = 0
    visibility = 'visible'
    useTournament.setState({
      tournamentId: 't1',
      reload: async () => {
        reloads++
      },
    })
    // Opening the channel is what puts the listeners in.
    useTournament.getState().subscribe()
  })
  afterEach(() => useTournament.getState().unsubscribe())

  it('the signal coming back reloads the open tournament', () => {
    window.dispatchEvent(new Event('online'))
    expect(reloads).toBe(1)
  })

  it('showing the app again reloads; hiding it does not', () => {
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reloads).toBe(0)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reloads).toBe(1)
  })

  it('a design fixture, or no tournament open, never reloads', () => {
    useTournament.setState({ tournamentId: 'fixture:full12-live' })
    window.dispatchEvent(new Event('online'))
    useTournament.setState({ tournamentId: null })
    window.dispatchEvent(new Event('online'))
    expect(reloads).toBe(0)
  })

  it('the listeners go in once, however many times the channel is opened again', () => {
    useTournament.getState().unsubscribe()
    useTournament.getState().subscribe()
    window.dispatchEvent(new Event('online'))
    expect(reloads).toBe(1)
  })
})

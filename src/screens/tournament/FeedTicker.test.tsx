// @vitest-environment happy-dom
/**
 * MOT-19: on every new event the feed grew by a row and snapped back: the
 * line that dropped off the end kept its room for the whole move, then went
 * in one frame without its fade. Now each line has a slot that opens from
 * nothing and closes to nothing, so a line arriving at the top and one
 * leaving at the bottom trade their height over the same time.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import type { FeedEvent } from '../../engine/core/feed'
import { FeedTicker } from './FeedTicker'

afterEach(() => {
  cleanup()
  useTournament.setState({ tournamentId: null, data: null })
})

function load() {
  const snap = structuredClone(getFixture('full12-live')!.snapshot)
  const data = dataFromSnapshot(snap)
  useTournament.setState({ tournamentId: 'fixture:full12-live', data, loading: false, error: null, realtime: 'off' })
  return data
}
/** The board with one more event on top of its feed. */
function arrive(e: FeedEvent) {
  const data = useTournament.getState().data!
  useTournament.setState({ data: { ...data, state: { ...data.state, feed: [e, ...data.state.feed] } } })
}
const slots = () => Array.from(document.querySelectorAll<HTMLElement>('[class*="slot"]'))

describe('the feed (MOT-19)', () => {
  it('opens on its lines at rest, then a new line opens from nothing while the oldest closes to nothing', async () => {
    const data = load()
    const feed = data.state.feed
    expect(feed.length).toBeGreaterThan(3)
    render(<FeedTicker limit={3} />)
    // On its first frame every line is simply there.
    expect(slots()).toHaveLength(3)
    for (const s of slots()) expect(s.style.height === '' || s.style.height === 'auto').toBe(true)
    const first = feed[0]!
    act(() => arrive({ ...first, hole: first.hole + 100 }))
    // The new line starts with no height; the dropped one is still there, on its way out.
    const now = slots()
    expect(now).toHaveLength(4)
    expect(now[0]!.style.height).toBe('0px')
    // Once both have moved, three lines again.
    await waitFor(() => expect(slots()).toHaveLength(3), { timeout: 2000 })
  })
})

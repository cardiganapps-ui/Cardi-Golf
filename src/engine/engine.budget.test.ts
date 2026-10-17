/**
 * PERF-14: the engine's time budget. Every change on any phone recomputes the
 * whole tournament, so a 60-player one must stay at 8 ms or less (median, on
 * the review's 2.8 GHz server core; about four times that on a mid-range
 * phone). Skipped in the suite, where timings say nothing (other files run
 * alongside, and `npm test` measures coverage): run it on its own with
 *
 *   npm run bench:engine
 *
 * Measured on 2026-10-15 (Xeon 2.8 GHz, 200 runs): large60 4.5–4.7 ms, 10.5–12.6 before.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { computeTournament } from './computeTournament'
import { parseSettings } from './settings/schema'

const BUDGET_MS = 8
const RUNS = 200

function median(name: string): number {
  const snap = getFixture(name)!.snapshot
  const settings = parseSettings(snap.tournament.settings)
  for (let i = 0; i < 20; i++) computeTournament(snap, settings)
  const times: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now()
    computeTournament(snap, settings)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return times[RUNS >> 1]!
}

describe.skipIf(!process.env.POLO_ENGINE_BUDGET)('the engine’s budget (PERF-14)', () => {
  it(`a 60-player tournament recomputes in ${BUDGET_MS} ms or less`, () => {
    const large = median('large60')
    const small = median('full12-live')
    console.log(
      `computeTournament median: large60 ${large.toFixed(2)} ms, full12-live ${small.toFixed(2)} ms (budget ${BUDGET_MS} ms)`,
    )
    expect(large).toBeLessThanOrEqual(BUDGET_MS)
  })
})

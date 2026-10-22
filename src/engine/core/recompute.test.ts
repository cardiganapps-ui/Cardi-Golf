/**
 * PERF-14: every change recomputes the whole tournament. At 60 players that
 * took 10–17 ms (≈60 ms on a mid-range phone): the feed's replay looked holes
 * and snake passes up by scanning and walked a Map per save, the core built
 * the sentences of all 2,160 holes, and stats copied every hole to find one.
 * The numbers must not move: the engine's outputs were compared with the old
 * code's on every design fixture before this landed. What is pinned here is
 * what the speed rests on, and the replay's order, which the old sort got
 * wrong when stamps came in different forms. The budget itself is
 * `npm run bench:engine` (`src/engine/engine.budget.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import { parseSettings } from '../settings/schema'
import { makeFirstTournament, score } from '../testing/fixtures'
import { computeCore, holeWhy } from './compute'
import { canonicalTime, timeKey } from './time'
import type { HoleResult } from './types'
import { say, type Msg } from '../messages'
import { words } from '../testing/words'

describe('the feed replays saves in time order, whatever form a stamp takes', () => {
  it('a whole second, a space for the T, the phone’s «Z» and the server’s offset: each pair in the order it happened', () => {
    const snap = makeFirstTournament()
    // Pairs of saves on hole 1 (par 4: a 3 is a birdie for anyone), the second of each later than the first.
    const stamps = [
      '2027-04-09T12:00:01+00:00', // a stamp on the whole second
      '2027-04-09T12:00:01.5+00:00', // half a second later
      '2027-04-09T12:00:02.000000+00:00',
      '2027-04-09 12:00:03.25+00', // a space for the T and a short offset
      '2027-04-09T12:00:04.123Z', // the phone's own clock (a queued hole)
      '2027-04-09T12:00:04.123456+00:00', // the server's, 456 µs later
    ]
    stamps.forEach((at, i) => snap.scores.push({ ...score('r1', `p${i + 1}`, 1, 3), updatedAt: at }))
    const feed = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).feed
    const birdies = feed.filter((e) => e.kind === 'birdie').map((e) => e.playerId)
    // Newest first. `localeCompare` put «.» before «+», a space before «T» and a digit before «Z»: p5, p6, p3, p1, p2, p4.
    expect(birdies).toEqual(['p6', 'p5', 'p4', 'p3', 'p2', 'p1'])
  })

  it('a stamp’s sort key is its one form, kept once worked out, and no stamp sorts first', () => {
    for (const v of [
      '2027-04-09 12:00:01.5+00',
      '2027-04-09T12:00:01.500000+00:00',
      '2027-04-09T12:00:01.5Z',
      'no es una hora',
    ]) {
      expect(timeKey(v)).toBe(canonicalTime(v))
      expect(timeKey(v)).toBe(timeKey(v))
    }
    expect(timeKey('2027-04-09 12:00:01.5+00')).toBe(timeKey('2027-04-09T12:00:01.5Z'))
    expect(timeKey(null)).toBe('')
    expect(timeKey(undefined)).toBe('')
  })
})

const holesOf = (core: ReturnType<typeof computeCore>): HoleResult[] =>
  core.roundIds.flatMap((rid) => Object.values(core.rounds[rid] ?? {}).flatMap((pr) => pr.holes))
const figure = (h: HoleResult) => [h.par, h.strokeIndex, h.strokesReceived, h.gross, h.pickedUp, h.played].join('|')

describe('a hole’s explanation is built once per figure (PERF-14)', () => {
  it.each(FIXTURE_NAMES)('%s: every hole says how its points came out, from its own figures', (name) => {
    const snap = getFixture(name)!.snapshot
    for (const h of holesOf(computeCore(snap, parseSettings(snap.tournament.settings))))
      expect(h.why).toEqual(holeWhy(h))
  })

  it('holes that read the same share one, frozen, so no reader can change another’s', () => {
    const snap = getFixture('full12-live')!.snapshot
    const holes = holesOf(computeCore(snap, parseSettings(snap.tournament.settings)))
    const byFigure = new Map<string, HoleResult>()
    let shared = 0
    for (const h of holes) {
      const first = byFigure.get(figure(h))
      if (first) {
        expect(h.why).toBe(first.why)
        shared++
      } else byFigure.set(figure(h), h)
      expect(Object.isFrozen(h.why)).toBe(true)
      expect(Object.isFrozen(h.why.steps)).toBe(true)
    }
    expect(shared).toBeGreaterThan(holes.length / 2)
    expect(() => (holes[0]!.why.steps as Msg[]).push(say('hole.unplayed'))).toThrow()
    expect(() => ((holes[0]!.why.title.params as { n: number }).n = 9)).toThrow()
    // A second compute hands back the same ones.
    const again = holesOf(computeCore(snap, parseSettings(snap.tournament.settings)))
    again.forEach((h, i) => expect(h.why).toBe(holes[i]!.why))
  })

  it('a figure outside the usual ranges gets one of its own, said the same way', () => {
    const snap = makeFirstTournament()
    snap.scores.push(score('r1', 'p1', 1, 99))
    const hole = () => computeCore(snap, FIRST_TOURNAMENT_SETTINGS).rounds.r1!.p1!.holes[0]!
    const [a, b] = [hole(), hole()]
    expect(a.why).not.toBe(b.why)
    expect(a.why).toEqual(holeWhy(a))
    expect(words(a.why).steps[1]).toBe(`99 − ${a.strokesReceived} = ${99 - a.strokesReceived} neto`)
  })
})

describe('the moment of the tournament keeps its rule', () => {
  it('the best figure; on a tie the harder stroke index, then the first card read', () => {
    const snap = makeFirstTournament()
    // Hole 1 is SI 7, hole 2 SI 11 (both par 4). p1 and p2 eagle hole 2; p3, who gets a stroke on hole 1,
    // makes a net eagle there: the same points, on the harder hole, so it wins.
    snap.scores.push(score('r1', 'p1', 2, 2), score('r1', 'p2', 2, 2), score('r1', 'p3', 1, 3))
    const points = (pid: string, hole: number) =>
      computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).core.rounds.r1![pid]!.holes[hole - 1]!.points
    expect(points('p3', 1)).toBe(points('p1', 2))
    expect(computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).stats.moment).toMatchObject({
      playerId: 'p3',
      hole: 1,
      strokeIndex: 7,
    })
    // Same hole, same figure: the first card read keeps it.
    snap.scores.pop()
    expect(computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).stats.moment).toMatchObject({ playerId: 'p1', hole: 2 })
  })
})

/**
 * The race chart's model (VIS-21, A11Y-20, MOT-21): who stands out and in
 * which colour, the axis of days, the scales and paths, the labels and the
 * sentence. Pure: no DOM.
 */
import { describe, expect, it } from 'vitest'
import {
  axisLength,
  highlights,
  holeOf,
  layoutRace,
  niceTicks,
  placeLabels,
  placesAt,
  pointAt,
  summarize,
  valueAt,
  type RaceEntrant,
} from './raceModel'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

describe('who stands out (VIS-21)', () => {
  it('a field of six or fewer: everyone in colour, this phone first in the accent, the rest by the field order', () => {
    const order = ['p3', 'p1', 'p4', 'p2']
    const h = highlights(order, ids(4), { me: 'p2', honoree: 'p4' })
    expect(h.map((x) => [x.id, x.slot])).toEqual([
      ['p1', 2],
      ['p2', 1],
      ['p3', 3],
      ['p4', 4],
    ])
    expect(h.find((x) => x.id === 'p2')!.roles).toEqual(['me'])
    expect(h.find((x) => x.id === 'p4')!.roles).toEqual(['honoree'])
    expect(h.find((x) => x.id === 'p1')!.roles).toEqual(['all'])
  })

  it('a re-sort of a small field repaints nobody: colours follow the entrant, not his rank', () => {
    const a = highlights(['p1', 'p2', 'p3'], ids(3), {})
    const b = highlights(['p3', 'p2', 'p1'], ids(3), {})
    const slot = (h: typeof a) => Object.fromEntries(h.map((x) => [x.id, x.slot]))
    expect(slot(b)).toEqual(slot(a))
  })

  it('a field of 60: the first three, this phone, the honoree and the one picked, six at most, the rest grey', () => {
    const order = ids(60)
    const h = highlights(order, order, { me: 'p40', honoree: 'p12', picked: 'p55' })
    expect(h.map((x) => x.id)).toEqual(['p40', 'p1', 'p2', 'p3', 'p12', 'p55'])
    expect(h.map((x) => x.slot)).toEqual([1, 2, 3, 4, 5, 6])
    expect(h.find((x) => x.id === 'p1')!.roles).toEqual(['leader'])
    expect(h.find((x) => x.id === 'p55')!.roles).toEqual(['picked'])
  })

  it('a pick comes last, so picking repaints none of the others', () => {
    const order = ids(12)
    const before = highlights(order, order, { me: 'p7', honoree: 'p9' })
    const after = highlights(order, order, { me: 'p7', honoree: 'p9', picked: 'p11' })
    for (const x of before) expect(after.find((y) => y.id === x.id)!.slot).toBe(x.slot)
    expect(after.at(-1)).toMatchObject({ id: 'p11', slot: 6 })
  })

  it('one player with several reasons is drawn once, with all of them', () => {
    const order = ids(12)
    const h = highlights(order, order, { me: 'p1', honoree: 'p1', picked: 'p1' })
    expect(h.map((x) => x.id)).toEqual(['p1', 'p2', 'p3'])
    expect(h[0]!.roles).toEqual(['leader', 'me', 'honoree', 'picked'])
  })

  it('a pick or a player outside the race is ignored', () => {
    const order = ids(10)
    expect(highlights(order, order, { me: 'zz', picked: 'yy' }).map((x) => x.id)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('the axis is the days as they are', () => {
  const days = [
    { number: 1, holes: 18 },
    { number: 2, holes: 9 },
  ]
  it('its length is the days’ holes, or the longest race when it runs past them', () => {
    expect(axisLength(days, [])).toBe(27)
    expect(axisLength([{ number: 1, holes: 9 }], [{ id: 'a', label: 'A', values: Array(11).fill(1) }])).toBe(11)
    expect(axisLength([], [])).toBe(1)
  })
  it('hole k of the axis is a day and its hole', () => {
    expect(holeOf(days, 1)).toEqual({ day: 1, hole: 1 })
    expect(holeOf(days, 18)).toEqual({ day: 1, hole: 18 })
    expect(holeOf(days, 19)).toEqual({ day: 2, hole: 1 })
    expect(holeOf(days, 27)).toEqual({ day: 2, hole: 9 })
  })
  it('marks the turn and the last hole of an 18-hole day, the last of a 9-hole one, a band per day', () => {
    const l = layoutRace({
      entrants: [],
      days,
      lowerIsBetter: false,
      width: 400,
      height: 280,
      labelWidth: 60,
      axisWidth: 30,
    })
    expect(l.xTicks.map((x) => [x.at, x.label])).toEqual([
      [9, '9'],
      [18, '18'],
      [27, '9'],
    ])
    expect(l.bands.map((b) => b.day)).toEqual([1, 2])
    expect(l.bands[1]!.x0).toBeCloseTo(l.bands[0]!.x1)
  })
  it('four days of 18 on a phone: still a band each', () => {
    const four = [1, 2, 3, 4].map((number) => ({ number, holes: 18 }))
    const l = layoutRace({
      entrants: [],
      days: four,
      lowerIsBetter: false,
      width: 343,
      height: 280,
      labelWidth: 80,
      axisWidth: 30,
    })
    expect(l.bands).toHaveLength(4)
    expect(l.n).toBe(72)
  })
})

describe('scales and paths', () => {
  const entrants: RaceEntrant[] = [
    { id: 'a', label: 'A', values: [2, 5, 7] },
    { id: 'b', label: 'B', values: [3, 3] },
  ]
  const days = [{ number: 1, holes: 4 }]
  const l = layoutRace({ entrants, days, lowerIsBetter: false, width: 230, height: 280, labelWidth: 60, axisWidth: 30 })

  it('every line starts at 0 on the first tee and steps through the engine’s figures, untouched', () => {
    // plot 30..170 for 4 holes: 35 px a hole.
    expect(l.x(0)).toBe(30)
    expect(l.x(4)).toBe(170)
    const pts = l.paths
      .a!.split(/[ML]/)
      .filter(Boolean)
      .map((p) => p.split(' ').map(Number))
    expect(pts.map(([x]) => x)).toEqual([30, 65, 100, 135])
    expect(pts.map(([, y]) => y)).toEqual([0, 2, 5, 7].map((v) => Math.round(l.y(v) * 10) / 10))
    expect(l.paths.b!.match(/L/g)).toHaveLength(2)
  })
  it('more is better on top; under strokes fewer is, so the scale turns over', () => {
    expect(l.y(7)).toBeLessThan(l.y(0))
    const s = layoutRace({
      entrants: [{ id: 'a', label: 'A', values: [-1, -3, 2] }],
      days,
      lowerIsBetter: true,
      width: 230,
      height: 280,
      labelWidth: 60,
      axisWidth: 30,
    })
    expect(s.y(-3)).toBeLessThan(s.y(2))
  })
  it('a point between two holes reads on the straight segment between them', () => {
    expect(pointAt(l, entrants[0]!.values, 1.5)).toEqual({ x: l.x(1.5), y: l.y(3.5) })
    // Past his last hole, a line stays where it ended.
    expect(pointAt(l, entrants[1]!.values, 3.7)).toEqual({ x: l.x(2), y: l.y(3) })
  })
  it('the figure after k holes, carried forward for whoever has played fewer', () => {
    expect(valueAt([2, 5, 7], 0)).toBe(0)
    expect(valueAt([2, 5, 7], 2)).toBe(5)
    expect(valueAt([2, 5, 7], 9)).toBe(7)
    expect(valueAt([], 3)).toBe(0)
  })
  it('round ticks, whole figures', () => {
    expect(niceTicks(0, 72)).toEqual([0, 20, 40, 60, 80])
    expect(niceTicks(-11, 6)).toEqual([-15, -10, -5, 0, 5, 10])
    expect(niceTicks(0, 3)).toEqual([0, 1, 2, 3])
    expect(niceTicks(0, 0)).toEqual([0])
    // The nearest step, not the first one past it: two marks on a plot of 91 points said nothing.
    expect(niceTicks(0, 91)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(-11, 14)).toEqual([-15, -10, -5, 0, 5, 10, 15])
  })
})

describe('labels at the end of the lines', () => {
  it('each at its figure, pushed apart so none overlaps', () => {
    const y = placeLabels(
      [
        { id: 'a', y: 100 },
        { id: 'b', y: 104 },
        { id: 'c', y: 50 },
      ],
      10,
      250,
    )
    expect(y).toEqual({ c: 50, a: 100, b: 114 })
  })
  it('kept inside the plot: a crowd at the bottom slides up', () => {
    const y = placeLabels(
      [
        { id: 'a', y: 248 },
        { id: 'b', y: 249 },
        { id: 'c', y: 250 },
      ],
      10,
      250,
    )
    expect(Object.values(y).sort((p, q) => p - q)).toEqual([222, 236, 250])
  })
  it('a label above the plot comes down to its top edge, and only the ones it would touch move (the leader is often at the very top)', () => {
    const y = placeLabels(
      [
        { id: 'a', y: 13 },
        { id: 'b', y: 37 },
        { id: 'c', y: 37 },
        { id: 'd', y: 120 },
      ],
      14,
      250,
    )
    expect(y).toEqual({ a: 14, b: 37, c: 51, d: 120 })
  })
  it('a crowd taller than the plot spreads over its whole height', () => {
    const y = placeLabels(
      ids(6).map((id) => ({ id, y: 30 })),
      10,
      50,
    )
    expect(Math.min(...Object.values(y))).toBe(10)
    expect(Math.max(...Object.values(y))).toBe(50)
  })
})

describe('places and the sentence (A11Y-20)', () => {
  const days = [
    { number: 1, holes: 3 },
    { number: 2, holes: 3 },
  ]
  const race: RaceEntrant[] = [
    { id: 'a', label: 'Ana', values: [3, 5, 6, 8, 11, 13] },
    { id: 'b', label: 'Beto', values: [2, 4, 7, 8, 10, 12] },
    { id: 'c', label: 'Caro', values: [1, 3, 5, 7] },
  ]
  it('places at a hole: ties share, under strokes fewer is better', () => {
    expect(placesAt(race, 4, false)).toEqual({ a: 1, b: 1, c: 3 })
    expect(placesAt(race, 4, true)).toEqual({ c: 1, a: 2, b: 2 })
  })
  it('who is in front at the end, and since when: the hole after the last one he did not lead alone', () => {
    // Beto led after hole 3; tied after hole 4; Ana alone from hole 5 (the 2nd of day 2).
    expect(summarize(race, days, false)).toEqual({
      leaders: ['a'],
      value: 13,
      holes: 6,
      tookLead: { day: 2, hole: 2 },
      wireToWire: false,
    })
  })
  it('in front from the first hole to the last', () => {
    const wire = [race[0]!, { ...race[2]!, values: [1, 2, 3, 4, 5, 6] }]
    expect(summarize(wire, days, false)).toMatchObject({ tookLead: null, wireToWire: true })
  })
  it('a shared lead names them all and no moment', () => {
    const tie = [race[0]!, { ...race[1]!, values: [2, 4, 7, 8, 10, 13] }]
    expect(summarize(tie, days, false)).toMatchObject({
      leaders: ['a', 'b'],
      value: 13,
      tookLead: null,
      wireToWire: false,
    })
  })
  it('nothing played: nothing to say', () => {
    expect(summarize([{ id: 'a', label: 'A', values: [] }], days, false)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { mapCourse, mapSearchHit } from './golfcourseapi'

const sample = {
  id: 1234,
  club_name: 'Quivira Golf Club',
  course_name: 'Quivira Los Cabos',
  location: { address: 'Cabo San Lucas', city: 'Cabo San Lucas', state: 'BCS', country: 'Mexico' },
  tees: {
    male: [
      {
        tee_name: 'Black',
        course_rating: 74.1,
        slope_rating: 141,
        par_total: 72,
        holes: Array.from({ length: 18 }, (_, i) => ({ par: i % 3 === 0 ? 5 : 4, yardage: 400 + i, handicap: 18 - i })),
      },
    ],
    female: [{ tee_name: 'Red', course_rating: 68.2, slope_rating: 118, par_total: 72, holes: Array.from({ length: 18 }, () => ({ par: 4 })) }],
  },
}

describe('GolfCourseAPI adapter', () => {
  it('maps a search hit', () => {
    expect(mapSearchHit(sample)).toEqual({ externalId: '1234', name: 'Quivira Los Cabos', clubName: 'Quivira Golf Club', location: 'Cabo San Lucas, BCS, Mexico' })
  })
  it('maps tees, holes and falls back to 1..18 stroke indexes when missing', () => {
    const c = mapCourse(sample)
    expect(c.tees).toHaveLength(2)
    expect(c.tees[0]!.name).toBe('Black')
    expect(c.tees[0]!.slope).toBe(141)
    expect(c.tees[0]!.holes[0]).toEqual({ number: 1, par: 5, strokeIndex: 18, yards: 400 })
    expect(c.tees[1]!.holes.map((h) => h.strokeIndex)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    expect(c.tees[1]!.gender).toBe('female')
  })
})

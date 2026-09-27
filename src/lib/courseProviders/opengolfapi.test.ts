import { describe, expect, it } from 'vitest'
import { mapCourse, mapSearchHit, OPENGOLF_ATTRIBUTION } from './opengolfapi'
import { mergeHits } from './types'
import { mapSearchHit as gcaHit } from './golfcourseapi'

const searchRow = { id: '79fb43c9', name: 'Solmar Golf Links', course_name: 'Solmar Golf Links', city: 'Cabo San Lucas', latitude: 22.88, longitude: -109.93, par: 72, website: 'https://solmar.com' }

describe('OpenGolfAPI adapter', () => {
  it('maps a search hit with unknown card availability', () => {
    expect(mapSearchHit(searchRow)).toEqual({
      provider: 'opengolfapi',
      externalId: '79fb43c9',
      name: 'Solmar Golf Links',
      clubName: null,
      location: 'Cabo San Lucas',
      latitude: 22.88,
      longitude: -109.93,
      hasCard: null,
    })
  })

  it('a location-only course maps to zero tees with attribution', () => {
    const c = mapCourse({ ...searchRow, tees: [], holes_data: [] })
    expect(c.tees).toEqual([])
    expect(c.attribution).toBe(OPENGOLF_ATTRIBUTION)
    expect(c.website).toBe('https://solmar.com')
  })

  it('maps tees and holes_data with per-tee yardages', () => {
    const c = mapCourse({
      ...searchRow,
      _attribution: 'custom attribution',
      tees: [
        { tee_key: 'blue', tee_name: 'Blue', tee_color: 'Blue', gender: 'male', course_rating: 71.2, slope: 128, par: 72, yardage: 6500 },
        { tee_key: 'red', tee_name: 'Red', tee_color: 'Red', gender: 'female', course_rating: 68, slope: 115, par: 72, yardage: 5400 },
      ],
      holes_data: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, handicap_index: 18 - i, yardages: { blue: 400 + i, red: 300 + i } })),
    })
    expect(c.attribution).toBe('custom attribution')
    expect(c.tees).toHaveLength(2)
    expect(c.tees[0]!.holes[0]).toEqual({ number: 1, par: 4, strokeIndex: 18, yards: 400 })
    expect(c.tees[1]!.holes[17]).toEqual({ number: 18, par: 4, strokeIndex: 1, yards: 317 })
    expect(c.tees[0]!.slope).toBe(128)
  })
})

describe('mergeHits', () => {
  it('merges the same course from two providers and prefers the one with a card', () => {
    const g = gcaHit({ id: 'mz9', club_name: 'Quivira Golf Club', course_name: 'Quivira Los Cabos', location: { city: 'Cabo San Lucas' }, tees: { male: 5, female: 0 } })
    const o = mapSearchHit({ id: '7166', name: 'Quivira Golf Club', course_name: 'Quivira Golf Club', city: 'Cabo San Lucas', latitude: 22.9, longitude: -109.9 })
    const solmar = mapSearchHit(searchRow)
    const merged = mergeHits([[g], [o, solmar]])
    expect(merged).toHaveLength(2)
    expect(merged[0]!.provider).toBe('golfcourseapi')
    expect(merged[0]!.hasCard).toBe(true)
    expect(merged[1]!.name).toBe('Solmar Golf Links')
  })
  it('keeps two same-named courses apart when they are far from each other', () => {
    const a = mapSearchHit({ id: '1', name: 'Country Club', course_name: 'Country Club', city: 'A', latitude: 20, longitude: -100 })
    const b = mapSearchHit({ id: '2', name: 'Country Club', course_name: 'Country Club', city: 'B', latitude: 25, longitude: -100 })
    expect(mergeHits([[a], [b]])).toHaveLength(2)
  })
})

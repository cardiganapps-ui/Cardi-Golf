/**
 * GolfCourseAPI adapter (https://api.golfcourseapi.com). Pure mapping: the
 * serverless route fetches, this file shapes. Verified shapes (2026-09-27):
 *   search → { courses: [{ id, club_name, course_name, location: {…}, tees: { male: <count>, female: <count> } }] }
 *   detail → { course: { …, tees: { male: [tee], female: [tee] } } }
 *   tee: { tee_name, course_rating, slope_rating, par_total, holes: [{ par, yardage, handicap }] }
 */
import type { ProviderCourse, ProviderSearchHit, ProviderTee } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>

function locationOf(c: Any): string | null {
  const loc = c.location ?? {}
  const parts = [loc.city, loc.state, loc.country].filter(Boolean)
  return parts.length ? parts.join(', ') : (loc.address ?? null)
}

const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export function mapSearchHit(c: Any): ProviderSearchHit {
  const t = c.tees ?? {}
  const count = (v: unknown) => (Array.isArray(v) ? v.length : Number(v) || 0)
  const tees = count(t.male) + count(t.female)
  return {
    provider: 'golfcourseapi',
    externalId: String(c.id),
    name: c.course_name ?? c.club_name ?? 'Campo',
    clubName: c.club_name ?? null,
    location: locationOf(c),
    latitude: num(c.location?.latitude),
    longitude: num(c.location?.longitude),
    hasCard: tees > 0,
  }
}

function mapTee(t: Any, gender: string): ProviderTee | null {
  const holes = Array.isArray(t.holes) ? t.holes : []
  if (holes.length < 9) return null
  const mapped = holes.slice(0, 18).map((h: Any, i: number) => ({
    number: i + 1,
    par: Number(h.par) || 4,
    strokeIndex: Number(h.handicap) || i + 1,
    yards: h.yardage != null ? Number(h.yardage) : null,
  }))
  // Some cards ship without stroke indexes; fall back to 1..18 and let the organizer fix it.
  const sis = new Set(mapped.map((h) => h.strokeIndex))
  if (sis.size !== mapped.length) mapped.forEach((h, i) => (h.strokeIndex = i + 1))
  return {
    name: t.tee_name ?? 'Tee',
    color: null,
    rating: num(t.course_rating),
    slope: num(t.slope_rating),
    parTotal: num(t.par_total),
    gender,
    holes: mapped,
  }
}

export function mapCourse(c: Any): ProviderCourse {
  const tees: ProviderTee[] = []
  for (const gender of ['male', 'female']) {
    const list = c.tees?.[gender]
    if (!Array.isArray(list)) continue
    for (const t of list) {
      const m = mapTee(t, gender)
      if (m) tees.push(m)
    }
  }
  return {
    provider: 'golfcourseapi',
    externalId: String(c.id),
    name: c.course_name ?? c.club_name ?? 'Campo',
    clubName: c.club_name ?? null,
    location: locationOf(c),
    latitude: num(c.location?.latitude),
    longitude: num(c.location?.longitude),
    website: null,
    attribution: null,
    tees,
  }
}

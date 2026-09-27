/**
 * GolfCourseAPI adapter (https://api.golfcourseapi.com). Pure mapping: the
 * serverless route fetches, this file shapes. Their payload:
 *   { courses: [{ id, club_name, course_name, location: { address, city, state, country },
 *       tees: { male: [...], female: [...] } }] }
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

export function mapSearchHit(c: Any): ProviderSearchHit {
  return {
    externalId: String(c.id),
    name: c.course_name ?? c.club_name ?? 'Campo',
    clubName: c.club_name ?? null,
    location: locationOf(c),
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
    rating: t.course_rating != null ? Number(t.course_rating) : null,
    slope: t.slope_rating != null ? Number(t.slope_rating) : null,
    parTotal: t.par_total != null ? Number(t.par_total) : null,
    gender,
    holes: mapped,
  }
}

export function mapCourse(c: Any): ProviderCourse {
  const tees: ProviderTee[] = []
  for (const gender of ['male', 'female']) {
    for (const t of c.tees?.[gender] ?? []) {
      const m = mapTee(t, gender)
      if (m) tees.push(m)
    }
  }
  return {
    externalId: String(c.id),
    name: c.course_name ?? c.club_name ?? 'Campo',
    clubName: c.club_name ?? null,
    location: locationOf(c),
    tees,
  }
}

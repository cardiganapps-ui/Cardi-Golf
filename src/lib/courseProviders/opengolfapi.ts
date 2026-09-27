/**
 * OpenGolfAPI adapter (https://api.opengolfapi.org, ODbL data). Verified
 * shapes (2026-09-27):
 *   search → { courses: [{ id, name, course_name, city, latitude, longitude, par, website, phone }], total }
 *   detail → { …, tees: [{ tee_key, tee_name, tee_color, gender, course_rating, slope, par, yardage }],
 *              holes_data: [{ number, par, handicap_index, yardages: { <tee color>: n } }], _attribution }
 * Many courses are location-only (no tees/holes); the UI then asks for the photo.
 */
import type { ProviderCourse, ProviderSearchHit, ProviderTee } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>

export const OPENGOLF_ATTRIBUTION = '© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI'

const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

function locationOf(c: Any): string | null {
  const parts = [c.city, c.state, c.country].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export function mapSearchHit(c: Any): ProviderSearchHit {
  return {
    provider: 'opengolfapi',
    externalId: String(c.id),
    name: c.course_name ?? c.name ?? 'Campo',
    clubName: c.name && c.course_name && c.name !== c.course_name ? c.name : null,
    location: locationOf(c),
    latitude: num(c.latitude),
    longitude: num(c.longitude),
    // The search payload does not say whether a card exists.
    hasCard: null,
  }
}

export function mapCourse(c: Any): ProviderCourse {
  const holesData: Any[] = Array.isArray(c.holes_data) ? c.holes_data : []
  const teesRaw: Any[] = Array.isArray(c.tees) ? c.tees : []
  const tees: ProviderTee[] = []
  if (holesData.length >= 9) {
    const baseHoles = holesData
      .slice()
      .sort((a, b) => Number(a.number) - Number(b.number))
      .slice(0, 18)
    const mkHoles = (teeKey: string | null, color: string | null) =>
      baseHoles.map((h, i) => {
        const y = h.yardages ?? {}
        const yards = num(teeKey && y[teeKey]) ?? num(color && y[color]) ?? num(color && y[String(color).toLowerCase()])
        return { number: Number(h.number) || i + 1, par: Number(h.par) || 4, strokeIndex: Number(h.handicap_index) || i + 1, yards }
      })
    const fixSi = (hs: ReturnType<typeof mkHoles>) => {
      if (new Set(hs.map((h) => h.strokeIndex)).size !== hs.length) hs.forEach((h, i) => (h.strokeIndex = i + 1))
      return hs
    }
    if (teesRaw.length) {
      for (const t of teesRaw) {
        tees.push({
          name: t.tee_name ?? t.tee_color ?? t.tee_key ?? 'Tee',
          color: t.tee_color ?? null,
          rating: num(t.course_rating),
          slope: num(t.slope),
          parTotal: num(t.par),
          gender: t.gender ?? null,
          holes: fixSi(mkHoles(t.tee_key ?? null, t.tee_color ?? null)),
        })
      }
    } else {
      tees.push({ name: 'Tee', color: null, rating: null, slope: null, parTotal: num(c.par), gender: null, holes: fixSi(mkHoles(null, null)) })
    }
  }
  return {
    provider: 'opengolfapi',
    externalId: String(c.id),
    name: c.course_name ?? c.name ?? 'Campo',
    clubName: c.name && c.course_name && c.name !== c.course_name ? c.name : null,
    location: locationOf(c),
    latitude: num(c.latitude),
    longitude: num(c.longitude),
    website: c.website ?? null,
    attribution: typeof c._attribution === 'string' && c._attribution ? c._attribution : OPENGOLF_ATTRIBUTION,
    tees,
  }
}

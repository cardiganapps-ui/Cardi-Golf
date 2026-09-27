/** Provider-neutral course shapes (§13b-A). Adapters map a provider's payload into these. */
export type ProviderId = 'golfcourseapi' | 'opengolfapi'

export interface ProviderHole {
  number: number
  par: number
  strokeIndex: number
  yards: number | null
}

export interface ProviderTee {
  name: string
  color: string | null
  rating: number | null
  slope: number | null
  parTotal: number | null
  gender: string | null
  holes: ProviderHole[]
}

export interface ProviderCourse {
  provider: ProviderId
  externalId: string
  name: string
  clubName: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  website: string | null
  /** Licence text to store and show (ODbL for OpenGolfAPI). */
  attribution: string | null
  tees: ProviderTee[]
}

export interface ProviderSearchHit {
  provider: ProviderId
  externalId: string
  name: string
  clubName: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  /** true = full scorecard available, false = location only, null = unknown until fetched. */
  hasCard: boolean | null
}

/** Opaque id the route accepts on `?id=`: "<provider>:<externalId>". */
export const hitRef = (h: { provider: ProviderId; externalId: string }) => `${h.provider}:${h.externalId}`
export function parseRef(ref: string): { provider: ProviderId; externalId: string } | null {
  const i = ref.indexOf(':')
  if (i < 0) return null
  const provider = ref.slice(0, i)
  if (provider !== 'golfcourseapi' && provider !== 'opengolfapi') return null
  return { provider, externalId: ref.slice(i + 1) }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(golf|club|course|links|resort|the|de|del|el|la)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function km(a: ProviderSearchHit, b: ProviderSearchHit): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null
  const R = 6371
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/**
 * Merge hits from several providers: same normalized name (or one contains
 * the other) and, when both have coordinates, under 2 km → one hit. The one
 * with a card wins; otherwise the first.
 */
export function mergeHits(lists: ProviderSearchHit[][]): ProviderSearchHit[] {
  const out: ProviderSearchHit[] = []
  for (const list of lists) {
    for (const hit of list) {
      const n = norm(hit.name)
      const idx = out.findIndex((o) => {
        const m = norm(o.name)
        const sameName = n === m || (n.length > 4 && m.includes(n)) || (m.length > 4 && n.includes(m))
        if (!sameName) return false
        const d = km(o, hit)
        return d == null || d < 2
      })
      if (idx < 0) out.push(hit)
      else {
        const cur = out[idx]!
        if (cur.hasCard !== true && hit.hasCard === true) out[idx] = { ...hit, location: hit.location ?? cur.location }
        else if (cur.latitude == null && hit.latitude != null) out[idx] = { ...cur, latitude: hit.latitude, longitude: hit.longitude }
      }
    }
  }
  return out.sort((a, b) => Number(b.hasCard === true) - Number(a.hasCard === true))
}

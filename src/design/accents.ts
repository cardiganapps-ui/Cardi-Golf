/**
 * The curated event accents an organizer can pick from (DESIGN_DIRECTION.md).
 * Stored as-is in tournaments.accent_color; a legacy free-form value maps to
 * the nearest one for display only. Values mirror --chart-1..6 in tokens.css.
 */
export interface Accent {
  id: string
  name: string
  hex: string
}
export const ACCENTS: readonly Accent[] = [
  { id: 'fairway', name: 'Fairway', hex: '#1e6b3b' },
  { id: 'agua', name: 'Agua', hex: '#2b5b8c' },
  { id: 'atardecer', name: 'Atardecer', hex: '#b4532a' },
  { id: 'vino', name: 'Vino', hex: '#8a2e3a' },
  { id: 'pizarra', name: 'Pizarra', hex: '#3f4a54' },
  { id: 'arena', name: 'Arena', hex: '#7a5a2e' },
] as const
export const DEFAULT_ACCENT = ACCENTS[0]!

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** The curated accent closest to any stored color (never throws). */
export function nearestAccent(hex: string | null | undefined): Accent {
  const c = hex ? rgb(hex) : null
  if (!c) return DEFAULT_ACCENT
  let best = DEFAULT_ACCENT
  let bestD = Infinity
  for (const a of ACCENTS) {
    const r = rgb(a.hex)!
    const d = (r[0] - c[0]) ** 2 + (r[1] - c[1]) ** 2 + (r[2] - c[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

/**
 * The curated event accents an organizer can pick from (DESIGN_DIRECTION.md).
 * Stored as-is in tournaments.accent_color; a value that is not one of them
 * maps to one for display only, and the screens apply it by id
 * (`data-accent`, tokens.css), which carries its light and dark values.
 *
 * VIS-09 (2026-10-16): four of the first six collided with the semantic
 * colors (Agua was the over-par blue, ΔE2000 2.9; Vino the under-par red, 8.0;
 * Arena the caution brown, 7.5; Pizarra the secondary ink, 10.3). These keep
 * the names and stand 15 or more ΔE2000 from every semantic color in both
 * themes (accents.test.ts). A tournament that stored one of the first six
 * keeps its name (`LEGACY`); any other value goes to the nearest in OKLab,
 * which sees color as people do (RGB distance sent a club green to Pizarra).
 * `hex` mirrors the light value of `[data-accent]` and --chart-1..6.
 */
export interface Accent {
  id: string
  name: string
  hex: string
}
export const ACCENTS: readonly Accent[] = [
  { id: 'fairway', name: 'Fairway', hex: '#1e6b3b' },
  { id: 'agua', name: 'Agua', hex: '#086b7c' },
  { id: 'atardecer', name: 'Atardecer', hex: '#aa4205' },
  { id: 'vino', name: 'Vino', hex: '#8a1f66' },
  { id: 'pizarra', name: 'Pizarra', hex: '#5b3f9e' },
  { id: 'arena', name: 'Arena', hex: '#565612' },
] as const
export const DEFAULT_ACCENT = ACCENTS[0]!

/** The first curated set (until 2026-10-16): a tournament that stored one keeps its accent's name. */
export const LEGACY: Readonly<Record<string, string>> = {
  '#2b5b8c': 'agua',
  '#b4532a': 'atardecer',
  '#8a2e3a': 'vino',
  '#3f4a54': 'pizarra',
  '#7a5a2e': 'arena',
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** OKLab (Björn Ottosson): a color space where distance is close to how different two colors look. */
export function oklab(c: [number, number, number]): [number, number, number] {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
/** The curated accent closest to any stored color (never throws). */
export function nearestAccent(hex: string | null | undefined): Accent {
  const c = hex ? rgb(hex) : null
  if (!c) return DEFAULT_ACCENT
  const key = `#${hex!.trim().replace('#', '').toLowerCase()}`
  const exact = ACCENTS.find((a) => a.hex === key) ?? ACCENTS.find((a) => a.id === LEGACY[key])
  if (exact) return exact
  const p = oklab(c)
  let best = DEFAULT_ACCENT
  let bestD = Infinity
  for (const a of ACCENTS) {
    const q = oklab(rgb(a.hex)!)
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

export type RoundingMode = 'halfUp' | 'halfDown' | 'nearestEven' | 'floor' | 'ceil'

const EPS = 1e-9

/** 17.5 → 18, 11.2 → 11. Tolerant of float noise (0.8 × 14 = 11.200000000000001). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + EPS)
}

export function roundWith(x: number, mode: RoundingMode): number {
  switch (mode) {
    case 'halfUp':
      return roundHalfUp(x)
    case 'halfDown':
      return Math.ceil(x - 0.5 - EPS)
    case 'nearestEven': {
      const f = Math.floor(x)
      const diff = x - f
      if (Math.abs(diff - 0.5) < EPS) return f % 2 === 0 ? f : f + 1
      return Math.round(x)
    }
    case 'floor':
      return Math.floor(x + EPS)
    case 'ceil':
      return Math.ceil(x - EPS)
  }
}

/** Round to `decimals` places, half up. */
export function roundTo(x: number, decimals: number): number {
  const m = 10 ** decimals
  return roundHalfUp(x * m) / m
}

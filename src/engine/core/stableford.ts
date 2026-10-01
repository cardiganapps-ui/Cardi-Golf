/**
 * Stableford points per hole (§5.3):
 *   pickedUp ? 0 : max(0, par + strokesReceived − gross + 2)
 */
export function stablefordPoints(
  par: number,
  strokesReceived: number,
  gross: number | null,
  pickedUp: boolean,
): number {
  if (pickedUp || gross == null) return 0
  return Math.max(0, par + strokesReceived - gross + 2)
}

/** «birdie neto», «águila neta»… for the live badge and the hole's explanation (the term table: águila, never eagle). */
export function netScoreName(points: number): string {
  switch (points) {
    case 0:
      return 'doble bogey neto o peor'
    case 1:
      return 'bogey neto'
    case 2:
      return 'par neto'
    case 3:
      return 'birdie neto'
    case 4:
      return 'águila neta'
    default:
      return points >= 5 ? 'albatros neto' : ''
  }
}

/** Gross score name relative to par: «birdie», «par», «bogey»… */
export function grossScoreName(par: number, gross: number): string {
  const d = gross - par
  if (d <= -3) return 'albatros'
  if (d === -2) return 'águila'
  if (d === -1) return 'birdie'
  if (d === 0) return 'par'
  if (d === 1) return 'bogey'
  if (d === 2) return 'doble bogey'
  return `+${d}`
}

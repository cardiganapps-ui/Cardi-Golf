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

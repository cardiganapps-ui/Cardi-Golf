/**
 * Bids go up in the increment from the bid standing (§5.9: «las pujas suben
 * de $250 en $250»). A custom amount off that step, or not above the bid
 * standing, is refused with the valid amounts either side of it, so a
 * fat-fingered «1,370» never becomes a hammer price (MONEY-19). The server
 * holds the same rule.
 */
export function bidSteps(current: number, increment: number, amount: number): number[] | null {
  if (amount > current && (amount - current) % increment === 0) return null
  const steps = Math.floor((amount - current) / increment)
  if (steps < 1) return [current + increment]
  return [current + steps * increment, current + (steps + 1) * increment]
}

/** Holes in the order a group plays them: start hole 10 → 10..18, 1..9. */
export function playOrder(startHole: number, holes = 18): number[] {
  const out: number[] = []
  for (let i = 0; i < holes; i++) out.push(((startHole - 1 + i) % holes) + 1)
  return out
}

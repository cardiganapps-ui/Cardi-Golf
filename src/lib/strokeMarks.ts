/**
 * The marks a card draws for a hole's strokes (§9.3): a dot per stroke received, a ring per stroke a plus
 * handicap gives back there (MONEY-21). Said in words by `t.admin.players.strokesOn`, never as the glyphs.
 */
export function strokeMarks(n: number): string {
  return n > 0 ? '•'.repeat(n) : '◦'.repeat(-n)
}

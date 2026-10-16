/**
 * Read design tokens at runtime, for the few places that need a color as a
 * value instead of a CSS reference (canvas confetti, image export
 * backgrounds; the race chart's strokes are CSS, `--race-1..6`). Colors are
 * declared once, in src/styles/tokens.css.
 */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}
/** Confetti: the accent, the board accent and the card stock. */
export function celebrationColors(): string[] {
  return ['--event-accent', '--board-accent', '--under', '--surface-2'].map((v) => cssVar(v)).filter(Boolean)
}

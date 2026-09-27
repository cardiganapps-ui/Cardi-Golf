/**
 * Read design tokens at runtime, for the few places that need a color as a
 * value instead of a CSS reference (canvas confetti, chart strokes, image
 * export backgrounds). Colors are declared once, in src/styles/tokens.css.
 */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}
/** The categorical series --chart-1..N, in order. */
export function chartSeries(n = 12): string[] {
  return Array.from({ length: n }, (_, i) => cssVar(`--chart-${i + 1}`)).filter(Boolean)
}
/** Confetti: the accent, the board accent and the card stock. */
export function celebrationColors(): string[] {
  return ['--event-accent', '--board-accent', '--under', '--surface-2'].map((v) => cssVar(v)).filter(Boolean)
}

/** WCAG 2.x relative luminance and contrast ratio for #rrggbb colors. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
/** Contrast ratio rounded to one decimal, e.g. 7.2. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 10) / 10
}

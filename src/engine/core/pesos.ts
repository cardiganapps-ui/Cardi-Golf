/**
 * Pesos as every explanation writes them (MONEY-15): «$10,000», «−$1,200».
 * One formatter for the whole engine: «¿Cómo se calculó?» printed «$10000»
 * beside the screen's «$10,000». Locale-free on purpose (the engine runs
 * anywhere, tests included); the screens' `formatMoney` reads the same.
 */
export function pesos(n: number): string {
  const whole = Math.round(n)
  return `${whole < 0 ? '−' : ''}$${Math.abs(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

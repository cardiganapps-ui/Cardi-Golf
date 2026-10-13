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

/** Pesos with their centavos when there are any (MONEY-16): «$6,462.50», «$6,600». For the step where a share becomes pesos. */
export function pesosCents(n: number): string {
  const cents = Math.round(n * 100)
  if (cents % 100 === 0) return pesos(cents / 100)
  const abs = Math.abs(cents)
  return `${cents < 0 ? '−' : ''}${pesos(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`
}

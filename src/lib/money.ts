/** MXN, no decimals, formatted like `$2,500` (CLAUDE.md §2). */
const formatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency = 'MXN'): string {
  let f = formatters.get(currency)
  if (!f) {
    f = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
    formatters.set(currency, f)
  }
  return f.format(amount)
}

/** Signed variant for nets: "+$1,200" / "−$300" / "$0". */
export function formatSignedMoney(amount: number, currency = 'MXN'): string {
  if (amount === 0) return formatMoney(0, currency)
  const sign = amount > 0 ? '+' : '−'
  return `${sign}${formatMoney(Math.abs(amount), currency)}`
}

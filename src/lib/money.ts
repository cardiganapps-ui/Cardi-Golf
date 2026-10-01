/** MXN, no decimals, formatted like `$2,500` (CLAUDE.md §2); a negative amount takes a true minus, «−$300». */
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
  // Intl writes a hyphen («-$300»); figures take the true minus sign (DESIGN_DIRECTION.md).
  return f.format(amount).replace('-', '−')
}

/** Signed variant for nets: "+$1,200" / "−$300" / "$0". */
export function formatSignedMoney(amount: number, currency = 'MXN'): string {
  if (amount === 0) return formatMoney(0, currency)
  const sign = amount > 0 ? '+' : '−'
  return `${sign}${formatMoney(Math.abs(amount), currency)}`
}

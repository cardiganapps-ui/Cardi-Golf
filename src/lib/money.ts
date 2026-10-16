/**
 * Money as every screen writes it: whole units, formatted like `$2,500` for MXN (CLAUDE.md §2); a negative
 * amount takes a true minus, «−$300». The currency is the tournament's (`settings.currency`, ARCH-06), never
 * this file's: every call names it, so a second currency is data, not code. A tournament's screens read it with
 * `useCurrency()` (src/components/currency.ts).
 */
const formatters = new Map<string, Intl.NumberFormat>()

/** The platform's currency: the one the settings allow today (`settingsSense`, MONEY-13) and a new tournament's. */
export const PLATFORM_CURRENCY = 'MXN'

export function formatMoney(amount: number, currency: string): string {
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
export function formatSignedMoney(amount: number, currency: string): string {
  if (amount === 0) return formatMoney(0, currency)
  const sign = amount > 0 ? '+' : '−'
  return `${sign}${formatMoney(Math.abs(amount), currency)}`
}

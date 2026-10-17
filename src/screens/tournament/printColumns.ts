import { t } from '../../i18n/es-MX'

/**
 * The card's columns in play order (VIS-25): each nine's holes, then its subtotal («Ida» for 1–9, «Vuelta» for
 * 10–18), then the total, as the app's own grid adds them. A nine-hole day has its holes and the total only.
 */
export type PrintColumn = { key: string; label: string; hole: number | null; holes: number[] }
export function printColumns(order: number[]): PrintColumn[] {
  const nines: number[][] = []
  for (const h of order) {
    const last = nines.at(-1)
    if (last && last[0]! <= 9 === h <= 9) last.push(h)
    else nines.push([h])
  }
  const cols: PrintColumn[] = []
  for (const nine of nines) {
    for (const h of nine) cols.push({ key: `h${h}`, label: String(h), hole: h, holes: [h] })
    if (nines.length > 1) cols.push({ key: nine[0]! <= 9 ? 'front' : 'back', label: nine[0]! <= 9 ? t.card.front : t.card.back, hole: null, holes: nine })
  }
  cols.push({ key: 'total', label: t.common.total, hole: null, holes: order })
  return cols
}

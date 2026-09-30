/** "hace 3 horas", "ayer", "hace 2 semanas": when something happened, in Mexican Spanish. */
const fmt = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })

const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

export function relTime(iso: string, now: number = Date.now()): string {
  let value = (new Date(iso).getTime() - now) / 1000
  if (Math.abs(value) < 45) return fmt.format(0, 'second')
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return fmt.format(Math.round(value), unit)
    value /= size
  }
  return fmt.format(Math.round(value), 'year')
}

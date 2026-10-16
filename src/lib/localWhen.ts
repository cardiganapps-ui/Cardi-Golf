/**
 * «8 abr 2027, 20:14»: a moment the server stamped, read in the tournament's
 * own time zone (America/Mazatlan for the first one), whatever the phone's.
 * On the 24-hour clock: es-MX's «8:14 p.m.» ends in a period, and a sentence
 * that goes on after it reads «p.m..». An unknown zone falls back to the
 * phone's; an unreadable time is shown as it came.
 */
export function localWhen(at: string, timeZone: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  try {
    return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone })
  } catch {
    return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' })
  }
}

/** «16 oct 2026»: the day it is now in the tournament's zone (a share card's date, ARCH-06); the phone's for an unknown zone. */
export function localDay(at: Date, timeZone: string): string {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' } as const
  try {
    return at.toLocaleDateString('es-MX', { ...opts, timeZone })
  } catch {
    return at.toLocaleDateString('es-MX', opts)
  }
}

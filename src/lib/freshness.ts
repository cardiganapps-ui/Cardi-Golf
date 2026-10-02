/**
 * How old the boards on screen are, in words read at a glance (REL-04): «hace
 * un momento», «hace 5 min», «hace 2 horas», «hoy, 10:42 a.m.», «ayer, 6:40
 * p.m.», «hace 3 días», «el 9 de abril», «el 6 de marzo de 2026». A board
 * saved two days ago used to read «10:42», like this morning's, or «hace 2880
 * min».
 */
import { t } from '../i18n/es-MX'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const clock = (d: Date) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** The date, with the year when it is not this year's: «el 6 de marzo» read like this spring's. */
const dateOf = (d: Date, now: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })

/** `at` and `now` in ms; the device's own time zone decides «hoy» and «ayer». */
export function savedWhen(at: number, now = Date.now()): string {
  const A = t.sync.ago
  const then = new Date(at)
  const today = startOfDay(new Date(now))
  // Saved later than now by more than a clock's drift: the phone's clock was
  // set back, so how long ago is unknown. Say when, never «hace un momento».
  if (at - now > MIN) return at < today + DAY ? A.today(clock(then)) : A.date(dateOf(then, new Date(now)))
  const ago = Math.max(0, now - at)
  if (ago < MIN) return A.now
  if (ago < HOUR) return A.minutes(Math.floor(ago / MIN))
  if (then.getTime() >= today) return ago < 6 * HOUR ? A.hours(Math.floor(ago / HOUR)) : A.today(clock(then))
  if (then.getTime() >= today - DAY) return A.yesterday(clock(then))
  // Calendar days, so a daylight-saving change can't make it 1.96 days.
  const days = Math.round((today - startOfDay(then)) / DAY)
  if (days < 7) return A.days(days)
  return A.date(dateOf(then, new Date(now)))
}

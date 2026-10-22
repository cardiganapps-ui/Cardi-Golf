/**
 * The moment a day starts, and how long until then (STRAT-10): a round's date
 * and its first tee time are the tournament's own wall clock (its time zone,
 * America/Mazatlan for the first one), whatever the phone's.
 */

/** The zone's offset from UTC at an instant, in ms (positive east of Greenwich). */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return (
    Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) -
    Math.floor(instant / 1000) * 1000
  )
}

/**
 * The instant a wall-clock date and time («2027-04-09», «09:00») is in `timeZone`; with no time, the start of that
 * day. Null for a date it can't read. An unknown zone reads as UTC rather than failing.
 */
export function zonedInstant(date: string, time: string | null, timeZone: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!d) return null
  const tm = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0)
  if (Number.isNaN(wall)) return null
  try {
    // Twice: the offset at the guess, then at the answer, so a day the clocks change lands right.
    const first = wall - offsetAt(wall, timeZone)
    return wall - offsetAt(first, timeZone)
  } catch {
    return wall
  }
}

/** The calendar date of an instant in `timeZone`, as «YYYY-MM-DD». */
export function zonedDate(instant: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(instant),
    )
  } catch {
    return new Date(instant).toISOString().slice(0, 10)
  }
}

export type Until =
  /** Two days or more: whole calendar days in the tournament's zone. */
  | { unit: 'days'; n: number }
  /** Tomorrow, by the calendar. */
  | { unit: 'tomorrow' }
  /** Today, with its hours and minutes left when the time is known. */
  | { unit: 'today'; hours: number | null; minutes: number | null }
  /** Already under way, or the day has passed. */
  | { unit: 'started' }

/** How long from `now` until a day that starts at `date` (and `time`, when known), on the tournament's calendar. */
export function untilDay(date: string, time: string | null, timeZone: string, now: number): Until | null {
  const at = zonedInstant(date, time, timeZone)
  if (at == null) return null
  const today = zonedDate(now, timeZone)
  if (date < today) return { unit: 'started' }
  if (date === today) {
    if (!time) return { unit: 'today', hours: null, minutes: null }
    const left = at - now
    if (left <= 0) return { unit: 'started' }
    const mins = Math.ceil(left / 60_000)
    return { unit: 'today', hours: Math.floor(mins / 60), minutes: mins % 60 }
  }
  // Calendar days, not 24-hour blocks: tomorrow at 7 is «mañana» at 11 p.m. tonight.
  const days = Math.round(
    (Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) -
      Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) /
      86_400_000,
  )
  return days === 1 ? { unit: 'tomorrow' } : { unit: 'days', n: days }
}

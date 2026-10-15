/**
 * A timestamp as the database wrote it, in one form whatever carried it: the
 * live channel and PostgREST both write ISO 8601, but a space for the T, a
 * short offset or a shorter fraction must not make two equal times differ.
 * Times of one database share its offset, so the forms also sort in time,
 * with `<` (PERF-14: the feed compared them with `localeCompare`, whose
 * collation puts «.» before «+» and a space before «T», so a stamp on the
 * whole second, or one written with a space for the T, could sort before an
 * earlier one).
 */
export function canonicalTime(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(v)
  if (!m) return v
  const tz = !m[4] || m[4] === 'Z' ? '+00:00' : m[4].length === 3 ? `${m[4]}:00` : m[4].includes(':') ? m[4] : `${m[4].slice(0, 3)}:${m[4].slice(3)}`
  return `${m[1]}T${m[2]}.${(m[3] ?? '').padEnd(6, '0').slice(0, 6)}${tz}`
}

const KEYS = new Map<string, string>()

/**
 * `canonicalTime` as a sort key, '' for no stamp. Every recompute replays the
 * same saves, so each stamp's form is kept once worked out: the function is
 * pure, so keeping its answers changes nothing but the time.
 */
export function timeKey(v: string | null | undefined): string {
  if (typeof v !== 'string') return ''
  let k = KEYS.get(v)
  if (k === undefined) {
    k = canonicalTime(v) ?? ''
    if (KEYS.size >= 50_000) KEYS.clear()
    KEYS.set(v, k)
  }
  return k
}

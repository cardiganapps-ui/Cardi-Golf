/** Tee times for consecutive groups: "09:00", "09:10", … with a proper hour carry (never "09:60"). */
export function withTeeTimes(first: string, count: number, stepMinutes = 10): string[] {
  const m = /^(\d{1,2}):(\d{2})/.exec(first || '')
  const h0 = m ? Number(m[1]) : 9
  const m0 = m ? Number(m[2]) : 0
  const start = (Number.isFinite(h0) ? h0 : 9) * 60 + (Number.isFinite(m0) ? m0 : 0)
  return Array.from({ length: count }, (_, i) => {
    const mins = (start + i * stepMinutes) % (24 * 60)
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  })
}

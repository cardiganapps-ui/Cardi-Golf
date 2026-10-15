/**
 * DB-20: the shared course catalog was read in one request, so the picker stopped at the server's cap (1,000
 * courses, alphabetical, or fewer under a lower «Max rows») with no error, and the catalog grows with every Ronda
 * rápida. It pages now, by name and then id, asking for the total on the first page.
 */
import { describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({
  courses: [] as Array<{ id: string; name: string; location: string | null; source: string; attribution: string | null; created_by: string | null; tees: Array<{ id: string }> }>,
  cap: 500,
  requests: [] as Array<{ from: number; to: number; count: boolean; order: string[] }>,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  supabase: () => ({
    from: (table: string) => {
      if (table !== 'courses') throw new Error(`unexpected table ${table}`)
      const q = { count: false, order: [] as string[] }
      const builder = {
        select: (_cols: string, opts?: { count?: string }) => {
          q.count = opts?.count === 'exact'
          return builder
        },
        order: (col: string) => {
          q.order.push(col)
          return builder
        },
        range: (from: number, to: number) => {
          server.requests.push({ from, to, count: q.count, order: [...q.order] })
          const sorted = [...server.courses].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          return Promise.resolve({ data: sorted.slice(from, Math.min(to + 1, from + server.cap)), error: null, count: q.count ? sorted.length : null })
        },
      }
      return builder
    },
  }),
}))
const { listCourses } = await import('./api')

describe('the course catalog pages (DB-20)', () => {
  it('1,200 courses behind a cap of 500: every one, once, in the picker’s order', async () => {
    server.courses = Array.from({ length: 1200 }, (_, i) => ({
      id: `c${String(i).padStart(4, '0')}`,
      // Names repeat (two «Campo 7»): the id keeps their order the same on every page.
      name: `Campo ${i % 600}`,
      location: null,
      source: 'manual',
      attribution: null,
      created_by: null,
      tees: [{ id: `t${i}` }],
    }))
    const courses = await listCourses()
    expect(courses).toHaveLength(1200)
    expect(new Set(courses.map((c) => c.id)).size).toBe(1200)
    expect(courses[0]!.tees).toBe(1)
    expect(server.requests.map((r) => [r.from, r.count])).toEqual([
      [0, true],
      [500, false],
      [1000, false],
    ])
    expect(server.requests.every((r) => r.order.join(',') === 'name,id')).toBe(true)
  })
})

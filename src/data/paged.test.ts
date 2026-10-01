/**
 * Audit P0-12 / QA-07: PostgREST answers at most 1,000 rows, so every list
 * read pages until a short page. The boundary is the whole point: exactly
 * 1,000 rows must ask once more, 1,001 must not lose the last one.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { fetchAll } from './paged'

/** A table of `n` rows behind the server's cap: each request gets its inclusive range, never more than 1,000 rows. */
function table(n: number, opts: { failAt?: number } = {}) {
  const requests: Array<[number, number]> = []
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }))
  const build = (from: number, to: number) => {
    requests.push([from, to])
    if (opts.failAt === requests.length) return Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } })
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
  }
  return { requests, build }
}

describe('fetchAll pages past the 1,000-row cap (audit P0-12)', () => {
  it.each<[number, Array<[number, number]>]>([
    [0, [[0, 999]]],
    [999, [[0, 999]]],
    [1000, [[0, 999], [1000, 1999]]],
    [1001, [[0, 999], [1000, 1999]]],
    [2500, [[0, 999], [1000, 1999], [2000, 2999]]],
  ])('%i rows: every row once, in order, in the pages shown', async (n, pages) => {
    const t = table(n)
    const rows = await fetchAll(t.build)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: n }, (_, i) => i))
    expect(t.requests).toEqual(pages)
  })

  it('an answer with no data and no error is an empty page', async () => {
    const requests: number[] = []
    const rows = await fetchAll((from) => {
      requests.push(from)
      return Promise.resolve({ data: null, error: null })
    })
    expect([rows, requests]).toEqual([[], [0]])
  })

  it('an error on a later page fails the whole read with the server’s code, never a partial list', async () => {
    const t = table(2500, { failAt: 2 })
    const err = await fetchAll(t.build).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect([(err as ApiError).message, (err as ApiError).code]).toEqual(['canceling statement due to statement timeout', '57014'])
    expect(t.requests).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

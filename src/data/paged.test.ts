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

/**
 * DB-20: the cap is the project's «Max rows», which a dashboard can set under 1,000. A short page then meant
 * «the last one» and every read lost the rest. With the total the server sends on the first page, the read
 * pages from where the rows received end until it holds them all.
 */
describe('fetchAll and a server whose page is shorter than 1,000 (DB-20)', () => {
  /** `n` rows behind a cap of `cap`, sending the total when asked (`count=exact`), as PostgREST does in Content-Range. */
  function capped(n: number, cap: number, opts: { deleteAfterFirst?: number } = {}) {
    const requests: Array<[number, number, boolean]> = []
    let rows = Array.from({ length: n }, (_, i) => ({ id: i }))
    const build = (from: number, to: number, count: boolean) => {
      requests.push([from, to, count])
      const page = rows.slice(from, Math.min(to + 1, from + cap))
      const answer = { data: page, error: null, count: count ? rows.length : null }
      if (requests.length === 1 && opts.deleteAfterFirst) rows = rows.slice(0, rows.length - opts.deleteAfterFirst)
      return Promise.resolve(answer)
    }
    return { requests, build }
  }

  it('1,200 rows behind a cap of 500: every row once, in order, each page from where the last ended', async () => {
    const t = capped(1200, 500)
    const rows = await fetchAll(t.build)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 1200 }, (_, i) => i))
    expect(t.requests).toEqual([
      [0, 999, true],
      [500, 1499, false],
      [1000, 1999, false],
    ])
  })

  it('the old rule would have stopped at 500: a short first page is not the end when the total says more', async () => {
    const t = capped(501, 500)
    expect(await fetchAll(t.build)).toHaveLength(501)
  })

  it('with the total, a read of exactly one page asks once, not twice', async () => {
    const t = capped(1000, 1000)
    expect(await fetchAll(t.build)).toHaveLength(1000)
    expect(t.requests).toHaveLength(1)
  })

  it('rows deleted while it reads end it on an empty page, never in a loop', async () => {
    const t = capped(1200, 500, { deleteAfterFirst: 800 })
    const rows = await fetchAll(t.build)
    expect(rows).toHaveLength(500)
    expect(t.requests.map((r) => r[0])).toEqual([0, 500])
  })

  it('only the first page asks for the total', async () => {
    const t = capped(2500, 1000)
    await fetchAll(t.build)
    expect(t.requests.map((r) => r[2])).toEqual([true, false, false])
  })
})

/**
 * PostgREST caps a response at 1,000 rows. Every list read goes through here
 * so a big tournament (or a long audit) never silently loses rows.
 *
 * DB-20: a short page used to mean the last one. The cap is the project's
 * «Max rows» (a dashboard setting): set under 1,000, every read stopped after
 * its first page and lost the rest without a word. The first page now asks
 * for the total (`count=exact`, which PostgREST answers in Content-Range), the
 * next starts where the rows received end, whatever the server's own page
 * size, and the read stops once it holds the total, or on an empty page (rows
 * deleted meanwhile). A server that sends no total (the in-memory one) keeps
 * the old rule.
 */
import { ApiError } from './apiError'

export const PAGE = 1000

/** One page's answer, as supabase-js gives it. */
export type PageOf<T> = PromiseLike<{
  data: T[] | null
  error: { message: string; code?: string } | null
  count?: number | null
}>

/** `build(from, to, count)` returns the query for one page (inclusive range); `count`: ask for the total with it. */
export async function fetchAll<T>(build: (from: number, to: number, count: boolean) => PageOf<T>): Promise<T[]> {
  const out: T[] = []
  let total: number | null = null
  for (;;) {
    const from = out.length
    const { data, error, count } = await build(from, from + PAGE - 1, from === 0)
    if (error) throw ApiError.from(error)
    const rows = data ?? []
    if (from === 0) total = typeof count === 'number' && count >= 0 ? count : null
    out.push(...rows)
    if (rows.length === 0) return out
    if (total !== null ? out.length >= total : rows.length < PAGE) return out
  }
}

/** What a page's select asks for: the total on the first page only. */
export const withCount = (count: boolean) => (count ? { count: 'exact' as const } : {})

/**
 * PostgREST caps a response at 1,000 rows. Every list read goes through here
 * so a big tournament (or a long audit) never silently loses rows.
 */
import { ApiError } from './api'

export const PAGE = 1000

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>

/** `build(from, to)` returns the query for one page (inclusive range). */
export async function fetchAll<T>(build: (from: number, to: number) => Res<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw ApiError.from(error)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

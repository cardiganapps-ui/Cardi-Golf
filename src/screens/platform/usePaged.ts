import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A searchable, paged list for the panel: typing waits a beat, a filter
 * change asks at once, a stale answer never overwrites a newer one, and
 * «Ver más» appends. `fetch` must be stable for the same query (useCallback).
 */
export function usePaged<T>(fetch: (offset: number) => Promise<{ total: number; rows: T[] }>, debounce: boolean) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seq = useRef(0)

  const load = useCallback(
    async (offset = 0) => {
      const mine = ++seq.current
      setError(null)
      try {
        const res = await fetch(offset)
        if (mine !== seq.current) return
        setTotal(res.total)
        setRows((prev) => (offset === 0 ? res.rows : [...(prev ?? []), ...res.rows]))
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e))
      }
    },
    [fetch],
  )

  useEffect(() => {
    const id = window.setTimeout(() => void load(0), debounce ? 250 : 0)
    return () => window.clearTimeout(id)
  }, [load, debounce])

  const more = useCallback(async () => {
    setLoadingMore(true)
    await load(rows?.length ?? 0)
    setLoadingMore(false)
  }, [load, rows])

  return { rows, total, error, loadingMore, reload: () => load(0), more }
}

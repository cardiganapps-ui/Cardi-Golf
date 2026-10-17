/**
 * A platform detail that may need the admin's reason before it opens (0068,
 * TRUST-22): `ViewReason.tsx` says why and shows the question. Read through
 * the server-state cache (ARCH-18): one key per detail, so the answer for a
 * detail left behind never shows on the next one.
 */
import { useCallback, useRef } from 'react'
import { needsViewReason } from '../../data/platform'
import { useServerQuery, type ServerKey } from '../../data/query'

/**
 * The detail as `open` gives it: undefined while loading, null when gone;
 * `asking` while the server wants a reason. `load(reason)` opens it with the
 * admin's reason; `load()` reads it again (the server remembers the reason
 * for two hours).
 */
export function useAdminView<T>(key: ServerKey, open: (reason?: string) => Promise<T | null>) {
  /** The reason typed for each detail: sent with its next read, and kept for the reads after it. */
  const reasons = useRef(new Map<string, string>())
  const id = JSON.stringify(key)
  const q = useServerQuery(key, () => open(reasons.current.get(id)))
  const { refetch } = q
  const load = useCallback(
    async (why?: string) => {
      if (why) reasons.current.set(id, why)
      await refetch()
    },
    [refetch, id],
  )
  const asking = needsViewReason(q.error)
  return { data: q.data, error: asking ? null : q.error, asking, load }
}

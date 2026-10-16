/**
 * A platform detail that may need the admin's reason before it opens (0068,
 * TRUST-22): `ViewReason.tsx` says why and shows the question.
 */
import { useCallback, useEffect, useState } from 'react'
import { needsViewReason } from '../../data/platform'
import { humanError } from '../../lib/humanError'

/** The detail as `open` gives it: undefined while loading, null when gone; `asking` while the server wants a reason. */
export function useAdminView<T>(open: (reason?: string) => Promise<T | null>) {
  const [data, setData] = useState<T | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const load = useCallback(
    async (reason?: string) => {
      setError(null)
      try {
        setData(await open(reason))
        setAsking(false)
      } catch (e) {
        if (needsViewReason(e)) setAsking(true)
        else setError(humanError(e))
      }
    },
    [open],
  )
  useEffect(() => {
    setData(undefined)
    setAsking(false)
    void load()
  }, [load])
  return { data, error, asking, load }
}

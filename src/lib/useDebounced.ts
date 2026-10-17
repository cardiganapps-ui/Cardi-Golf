import { useEffect, useState } from 'react'

/** `value`, once it has held still for `ms` (at once for 0, and on the first render). Compared by its JSON, so a fresh object with the same contents is no change. */
export function useDebounced<P>(value: P, ms: number): P {
  const [held, setHeld] = useState(value)
  const same = JSON.stringify(held) === JSON.stringify(value)
  useEffect(() => {
    if (same) return
    const id = window.setTimeout(() => setHeld(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms, same])
  if (!same && ms === 0) return value
  return held
}

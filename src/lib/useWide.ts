/**
 * Whether the screen is a laptop's or an iPad's (VIS-19: 900 px and wider), following it as the window changes.
 * False where the browser can't say (a test, an old browser): the phone's one column.
 */
import { useSyncExternalStore } from 'react'

export const WIDE = '(min-width: 900px)'

function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null
}

export function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = query()
      q?.addEventListener?.('change', onChange)
      return () => q?.removeEventListener?.('change', onChange)
    },
    () => query()?.matches ?? false,
    () => false,
  )
}

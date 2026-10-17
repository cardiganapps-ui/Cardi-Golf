import { useDebounced } from '../../lib/useDebounced'
import { useServerPages, type ServerKey } from '../../data/query'

/**
 * A searchable, paged list for the panel (ARCH-18: through the server-state
 * cache): typing waits a beat, a filter change asks at once, an answer for an
 * earlier search never lands over a later one (each search is its own key),
 * and «Ver más» appends. `params` are what the list is asked for (the search
 * and its filters); `debounce` holds a change of them for 250 ms.
 */
export function usePaged<T, P>(key: ServerKey, params: P, fetch: (params: P, offset: number) => Promise<{ total: number; rows: T[] }>, debounce: boolean) {
  const asked = useDebounced(params, debounce ? 250 : 0)
  return useServerPages([...key, asked], (offset) => fetch(asked, offset))
}

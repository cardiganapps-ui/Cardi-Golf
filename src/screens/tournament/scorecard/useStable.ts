import { useLayoutEffect, useRef, useState } from 'react'

type Handlers = Record<string, (...args: never[]) => unknown>

/**
 * The card's handlers, one function each for the card's whole life, each calling the latest render's: what a
 * tap reaches is what the screen last drew, as an inline handler is, while the memoized parts of the card (a
 * player's row, the save bar, a closed sheet) keep their props and skip the render (PERF-09). Never call them
 * during render. The keys are fixed at the first render.
 */
export function useStableHandlers<T extends Handlers>(fns: T): T {
  const latest = useRef(fns)
  useLayoutEffect(() => {
    latest.current = fns
  })
  const [stable] = useState(
    () => Object.fromEntries(Object.keys(fns).map((k) => [k, (...args: never[]) => latest.current[k]?.(...args)])) as T,
  )
  return stable
}

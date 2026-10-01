/**
 * A figure that counts up to its value when it appears: the points and the
 * money of a Ceremonia reveal (VIS-06, MOT-23). Screen readers get the final
 * value only, never the numbers flying by. With reduced motion (the device's,
 * or <MotionConfig reducedMotion>) it shows the value at once.
 */
import { useReducedMotionConfig } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { REVEAL } from '../design/motion'
import styles from './CountUp.module.css'

export function CountUp({ value, format, delayMs = 0 }: { value: number; format: (n: number) => string; delayMs?: number }) {
  const reduce = useReducedMotionConfig()
  const [shown, setShown] = useState(0)
  // What is on screen now, so a value that changes mid-count carries on from there.
  const onScreen = useRef(0)
  useEffect(() => {
    if (reduce) return
    const from = onScreen.current
    let frame = 0
    let start: number | undefined
    const tick = (now: number) => {
      start ??= now + delayMs
      const p = Math.min(1, Math.max(0, (now - start) / (REVEAL.countUp * 1000)))
      // Ease out: fast at first, settling on the value.
      onScreen.current = Math.round(from + (value - from) * (1 - (1 - p) ** 3))
      setShown(onScreen.current)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, delayMs, reduce])
  return (
    <>
      {/* The final value, unseen, holds the width from the first frame: the screen fits the step to «$6,600», not to «$0», so the count never spills. */}
      <span className={styles.figure}>
        <span aria-hidden="true">{format(reduce ? value : shown)}</span>
        <span className={styles.final} aria-hidden="true" data-final>
          {format(value)}
        </span>
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  )
}

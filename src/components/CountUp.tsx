/**
 * A figure that counts up to its value when it appears: the points and the
 * money of a Ceremonia reveal (VIS-06, MOT-23). Screen readers get the final
 * value only, never the numbers flying by. With reduced motion (the device's,
 * or <MotionConfig reducedMotion>) it shows the value at once.
 *
 * `from` is what it shows when it mounts and `seconds` how long a count takes:
 * the TV's Calcutta pot opens on its value and counts each sale's change over
 * the board's time (MOT-05).
 */
import { useReducedMotionConfig } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { REVEAL } from '../design/motion'
import styles from './CountUp.module.css'

export function CountUp({ value, format, delayMs = 0, seconds = REVEAL.countUp, from: initial = 0 }: { value: number; format: (n: number) => string; delayMs?: number; seconds?: number; from?: number }) {
  const reduce = useReducedMotionConfig()
  const [shown, setShown] = useState(initial)
  // What is on screen now, so a value that changes mid-count carries on from there.
  const onScreen = useRef(initial)
  useEffect(() => {
    if (reduce) return
    const from = onScreen.current
    if (from === value) return
    let frame = 0
    let start: number | undefined
    const tick = (now: number) => {
      start ??= now + delayMs
      const p = Math.min(1, Math.max(0, (now - start) / (seconds * 1000)))
      // Ease out: fast at first, settling on the value. The frames between are whole numbers; the last is the
      // value itself, so a match-play 1.5 ends on «1½», not on a rounded «2» (MOT-23).
      onScreen.current = p >= 1 ? value : Math.round(from + (value - from) * (1 - (1 - p) ** 3))
      setShown(onScreen.current)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, delayMs, reduce, seconds])
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

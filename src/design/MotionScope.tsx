/**
 * Every Motion animation honours the system's reduce-motion setting. This used to wrap the whole app in
 * main.tsx, and importing Motion there put all of it in the entry chunk: 40 KB gzip that the landing page,
 * the organizer and the profile screens never animate with (PERF-03). Every screen that animates is under a
 * tournament's gate (the real one, the link to watch's and the fixtures'), so each gate wraps what it shows.
 */
import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'

export function MotionScope({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/** A short accent rule (the tournament's accent). Replaces the wave motif. */
export function Wave({ className }: { className?: string }) {
  return <span className={`wave ${className ?? ''}`} aria-hidden="true" />
}

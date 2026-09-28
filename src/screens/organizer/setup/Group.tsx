import type { ReactNode } from 'react'

/** A titled group for compound controls (a label element would click its first button). */
export function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="stack" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="help">{hint}</span>}
    </div>
  )
}

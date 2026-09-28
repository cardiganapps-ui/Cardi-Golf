import { useState, type ReactNode } from 'react'
import type { Explanation } from '../engine/types'
import { t } from '../i18n/es-MX'
import { Sheet } from './ui'
import styles from './HowCalculated.module.css'

/** The explanation steps, in a sheet. Controlled, for callers that own the trigger. */
export function ExplanationSheet({ why, open, onClose, title }: { why: Explanation | Explanation[] | null; open: boolean; onClose: () => void; title?: string }) {
  const list = why ? (Array.isArray(why) ? why : [why]) : []
  return (
    <Sheet open={open} onClose={onClose} title={title ?? t.money.howCalculated}>
      <div className={styles.list}>
        {list.map((w, i) => (
          <section key={i} className={styles.block}>
            <strong>{w.title}</strong>
            <ol className={styles.steps}>
              {w.steps.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

/** "¿Cómo se calculó?": a quiet trigger that opens the explanation steps (§2, §6). */
export function HowCalculated({ why, children, label }: { why: Explanation | Explanation[]; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`btn btn--ghost btn--sm ${styles.trigger}`} onClick={() => setOpen(true)}>
        {children ?? (label ?? t.money.howCalculated)}
      </button>
      <ExplanationSheet why={why} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

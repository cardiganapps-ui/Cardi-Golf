import { useState, type ReactNode } from 'react'
import type { Explanation } from '../engine/types'
import { t } from '../i18n/es-MX'
import { Sheet } from './ui'

/** "¿Cómo se calculó?" — tap to open the explanation steps (§2, §6). */
export function HowCalculated({ why, children, label }: { why: Explanation | Explanation[]; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const list = Array.isArray(why) ? why : [why]
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" style={{ padding: '0 6px', minHeight: 32 }} onClick={() => setOpen(true)}>
        {children ?? (label ?? t.money.howCalculated)}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.money.howCalculated}>
        <div className="stack">
          {list.map((w, i) => (
            <div key={i} className="card card--cell" style={{ padding: 12 }}>
              <strong>{w.title}</strong>
              <ol className="small" style={{ marginTop: 6 }}>
                {w.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  )
}

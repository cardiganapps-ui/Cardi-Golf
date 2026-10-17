import { useState, type ReactNode } from 'react'
import type { Explanation } from '../engine/types'
import { t } from '../i18n/es-MX'
import { renderExplanation } from '../i18n/explain'
import { useCurrency } from './currency'
import { Sheet } from './ui'
import styles from './HowCalculated.module.css'
import { buttonClass } from './buttonClass'

/** What a sheet explains: the engine's explanations, a format's and a game's rules among them (codes, ARCH-05). */
export type Why = Explanation

/** The explanation steps, in a sheet. Controlled, for callers that own the trigger. */
export function ExplanationSheet({ why, open, onClose, title }: { why: Why | Why[] | null; open: boolean; onClose: () => void; title?: string }) {
  const currency = useCurrency()
  const list = (why ? (Array.isArray(why) ? why : [why]) : []).map((w) => renderExplanation(w, currency))
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

/**
 * "¿Cómo se calculó?": a quiet trigger that opens the explanation steps (§2, §6). Shown as a figure (`label`, an
 * amount or «?»), it is said as what it explains and that it explains it, «Campeón, $6,600: ¿Cómo se calculó?»
 * (`about` names the figure), never «$6,600» or «?» alone (A11Y-25). `ariaLabel` replaces that when a caller says
 * it whole. A figure is ink with a dotted underline, as every amount is (VIS-16): in the accent, money read green on
 * Juegos and nowhere else.
 */
export function HowCalculated({ why, children, label, about, ariaLabel, title }: { why: Why | Why[]; children?: ReactNode; label?: string; about?: string; ariaLabel?: string; title?: string }) {
  const [open, setOpen] = useState(false)
  const what = [about, label === '?' ? null : label].filter(Boolean).join(', ')
  const spoken = ariaLabel ?? (label != null || about ? t.money.howCalculatedOf(what) : undefined)
  return (
    <>
      <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' }, `${styles.trigger} ${label != null && label !== '?' ? styles.figure : ''}`)} onClick={() => setOpen(true)} aria-label={spoken} aria-haspopup="dialog">
        {children ?? (label ?? t.money.howCalculated)}
      </button>
      <ExplanationSheet why={why} open={open} onClose={() => setOpen(false)} title={title} />
    </>
  )
}

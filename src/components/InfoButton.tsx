/**
 * A circled "i" that opens an explanation.
 *
 * The app already had the sheet and the words — `ExplanationSheet`, and the
 * `describe()` the engine writes for every game and format — but no quiet way
 * to reach them, so the explanations sat where nobody looked. This is that
 * way: a 44px target that says nothing until it is asked.
 */
import { useState } from 'react'
import type { Explanation } from '../engine/types'
import { IconInfo } from './icons'
import { ExplanationSheet } from './HowCalculated'
import styles from './InfoButton.module.css'

export function InfoButton({ why, label, title }: { why: Explanation | Explanation[]; label: string; title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={styles.info} onClick={() => setOpen(true)} aria-label={label}>
        <IconInfo size={18} />
      </button>
      <ExplanationSheet why={why} open={open} onClose={() => setOpen(false)} title={title} />
    </>
  )
}

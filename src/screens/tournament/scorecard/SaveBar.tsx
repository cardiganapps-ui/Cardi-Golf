import { memo } from 'react'
import { IconCheck } from '../../../components/icons'
import { useOnline } from '../../../components/OfflineBanner'
import { hasStoredSession, useAuth } from '../../../data/auth'
import { useOutbox } from '../../../data/outbox'
import { t } from '../../../i18n/es-MX'
import { syncWords } from './syncWords'
import type { SavedNote } from './useHoleSave'
import styles from '../ScorecardScreen.module.css'

const S = t.card

/**
 * The line under «Guardar hoyo» (and under the grid): the last save with its way back for a few seconds, else
 * what this phone's writes are doing. It listens to the outbox itself, so a count changing renders this line
 * and nothing else of the card.
 */
export const SaveStatus = memo(function SaveStatus({ savedNote, onUndo }: { savedNote: SavedNote | null; onUndo: () => void }) {
  const pending = useOutbox((s) => s.pending)
  const pendingHoles = useOutbox((s) => s.pendingHoles)
  const heldHoles = useOutbox((s) => s.heldHoles)
  const lastError = useOutbox((s) => s.lastError)
  const rejected = useOutbox((s) => s.rejected.length)
  const signedOut = useAuth((s) => !s.user)
  const online = useOnline()
  const sync = syncWords({ pending, pendingHoles, heldHoles, lastError, rejected, signedOut, online, storedSession: hasStoredSession() })
  if (!savedNote) return <span className={`${styles.saveStatus} ${sync.warn ? styles.saveStatusWarn : ''}`}>{sync.text}</span>
  return (
    <span className={styles.savedLine}>
      <span>{savedNote.restored ? S.restoredHole(savedNote.hole) : savedNote.corrected !== undefined ? S.correctedHole(savedNote.hole, savedNote.corrected) : S.savedHole(savedNote.hole)}</span>
      {!savedNote.restored && (
        <button type="button" className={styles.savedAction} onClick={onUndo}>
          {savedNote.canUndo ? t.common.undo : S.correct}
        </button>
      )}
      {sync.short && <span className={`${styles.savedSync} ${styles.saveStatusWarn}`}>{sync.short}</span>}
    </span>
  )
})

/** «Guardar hoyo» and the line under it; a card that can't be edited says why instead. */
export const SaveBar = memo(function SaveBar(p: {
  label: string
  busy: boolean
  disabled: boolean
  /** For a moment after a save it shows «Guardado» (MOT-02); its name stays the button's, and taps then are the settle guard's (UX-02). */
  justSaved: boolean
  onSave: () => void
  /** Null when the card can be edited; else why not. */
  locked: string | null
  savedNote: SavedNote | null
  onUndo: () => void
}) {
  return (
    <div className={styles.saveBar}>
      <button className={`btn btn--primary btn--block ${styles.saveBtn} ${p.justSaved ? styles.saveBtnDone : ''}`} type="button" disabled={p.disabled} onClick={() => p.onSave()}>
        <span className={styles.saveLabel}>{p.busy ? t.common.saving : p.label}</span>
        {p.justSaved && (
          <span className={styles.saveCheck} aria-hidden="true">
            <IconCheck size={18} />
            {S.savedCheck}
          </span>
        )}
      </button>
      {p.locked == null ? <SaveStatus savedNote={p.savedNote} onUndo={p.onUndo} /> : <span className={`${styles.saveStatus} ${styles.saveStatusWarn}`}>{p.locked}</span>}
    </div>
  )
})

import { memo, useEffect, useState } from 'react'
import { IconCheck } from '../../../components/icons'
import { useOnline } from '../../../components/OfflineBanner'
import { hasStoredSession, useAuth } from '../../../data/auth'
import { useOutbox } from '../../../data/outbox'
import { t } from '../../../i18n/es-MX'
import { syncWords } from './syncWords'
import type { SavedNote } from './useHoleSave'
import styles from '../ScorecardScreen.module.css'

const S = t.card
/** While signed out, how often the line looks at the stored session again (auth-js removes it with no event). */
export const SESSION_RECHECK_MS = 2000

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
  // auth-js removes a session it gave up on after the user is already null, so no store tells this line: the
  // card used to read it again on its every render; now that it doesn't render the line, it looks again itself.
  const [, recheck] = useState(0)
  useEffect(() => {
    if (!signedOut || heldHoles === 0) return
    const id = setInterval(() => recheck((n) => n + 1), SESSION_RECHECK_MS)
    return () => clearInterval(id)
  }, [signedOut, heldHoles])
  const sync = syncWords({ pending, pendingHoles, heldHoles, lastError, rejected, signedOut, online, storedSession: hasStoredSession() })
  /*
   * What a screen reader is told as it happens (A11Y-14), in a region that is always mounted so a change in it is
   * heard: only what needs the player, a write the server refused or holes waiting for the PIN. Not «1 hoyo por
   * subir» after every save (the card already says the hole was saved), nor an error the outbox retries by itself.
   */
  const said = rejected ? t.sync.rejectedSaid(rejected) : heldHoles > 0 && signedOut && !hasStoredSession() ? t.sync.heldForPin(heldHoles) : ''
  const region = (
    <span className="sr-only" role="status">
      {said}
    </span>
  )
  if (!savedNote)
    return (
      <>
        {region}
        <span className={`${styles.saveStatus} ${sync.warn ? styles.saveStatusWarn : ''}`}>{sync.text}</span>
      </>
    )
  return (
    <>
      {region}
      <span className={styles.savedLine}>
        <span>{savedNote.restored ? S.restoredHole(savedNote.hole) : savedNote.corrected !== undefined ? S.correctedHole(savedNote.hole, savedNote.corrected) : S.savedHole(savedNote.hole)}</span>
        {!savedNote.restored && (
          <button type="button" className={styles.savedAction} onClick={onUndo}>
            {savedNote.canUndo ? t.common.undo : S.correct}
          </button>
        )}
        {sync.short && <span className={`${styles.savedSync} ${styles.saveStatusWarn}`}>{sync.short}</span>}
      </span>
    </>
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

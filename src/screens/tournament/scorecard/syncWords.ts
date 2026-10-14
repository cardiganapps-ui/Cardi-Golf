import { t } from '../../../i18n/es-MX'

/** What this phone's writes are doing, in the words the card shows (REL-16, REL-17, REL-21). */
export function syncWords(o: { pending: number; pendingHoles: number; heldHoles: number; lastError: string | null; rejected: number; signedOut: boolean; online: boolean; storedSession: boolean }) {
  // Holes, not rows: «3 hoyos por subir» is what a player can act on (REL-17). Offline too.
  // Holes saved after the phone lost its session (auth-js signed it out
  // mid-round) wait for the player to enter again: say so, not only «por
  // subir» (REL-16). A stored session still being confirmed needs no PIN.
  const needsPin = o.heldHoles > 0 && o.signedOut && !o.storedSession
  const waiting = needsPin ? t.sync.heldForPinShort(o.heldHoles) : o.pendingHoles > 0 ? t.sync.pendingHoles(o.pendingHoles) : o.pending > 0 ? t.sync.pending(o.pending) : null
  // What this phone's writes are doing, and only that: the signal is the header's to say (REL-21). It read
  // «Sin señal» here too, under the header's own. With no signal the last error waits for it, as it did.
  const error = o.online ? o.lastError : null
  return {
    text: o.rejected ? t.sync.rejected(o.rejected) : error ? error : (waiting ?? t.sync.synced),
    warn: !!error || o.pending > 0 || o.rejected > 0,
    /** The sync state in a few words, for the one-line saved note (a long error waits until the note goes). */
    short: o.rejected ? t.sync.rejected(o.rejected) : waiting,
  }
}

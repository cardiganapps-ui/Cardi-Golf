/**
 * Who can get into a tournament on their own changed: a PIN was set, a
 * profile was linked or unlinked, an account went away, a backup came back.
 * The writes that do it (`setPlayerPin`, the link RPCs in `profiles.ts`, the
 * platform's unlink and delete, `restoreBackup`) call `entryChanged`, and
 * «Para empezar» (`screens/admin/entryInfo.ts`) listens and asks again. A
 * change made on another phone reaches it when the Torneo card opens, or
 * with the players' realtime reload.
 */
const listeners = new Set<() => void>()

export function entryChanged(): void {
  for (const l of listeners) l()
}

export function onEntryChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

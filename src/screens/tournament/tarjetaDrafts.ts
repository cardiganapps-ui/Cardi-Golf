/*
 * A half-entered hole stays on the phone until it is saved (PWA-05): the
 * system back, a tab switch, another hole or the OS closing the app no longer
 * throws it away.
 * - Kept per round, group and hole, only for the players touched here.
 * - Each kept value carries what the server had for that player when he was
 *   first touched (after the hole's last save from this phone). If the server
 *   has changed since (the other phone saved him), that player's draft is
 *   dropped, not restored over the save: when the hole opens, and again
 *   whenever newer server values arrive while the restored draft is still
 *   untouched.
 * - Never restored onto a card that can't be edited (a signed card, a closed
 *   round).
 * - A restored hole says so («falta guardarlo») until it is saved.
 */
export interface Draft {
  strokes: number
  putts: number
  pickedUp: boolean
}
export interface KeptDraft {
  at: number
  players: Record<string, { draft: Draft; server: string }>
}

export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000
export const DRAFT_PREFIX = 'cardi-golf:tarjeta:'
const draftKey = (holeKey: string) => `${DRAFT_PREFIX}${holeKey}`

function drop(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Storage gone: nothing to drop.
  }
}

let swept = false
/**
 * Expired drafts go once per app start, not only when their hole opens again.
 * One unreadable value (a half-written one) can never be restored: it goes
 * too, and the sweep carries on with the rest.
 */
export function sweepKept() {
  if (swept) return
  swept = true
  let keys: string[]
  try {
    keys = Object.keys(localStorage)
  } catch {
    return // Storage unavailable: nothing to sweep.
  }
  for (const key of keys) {
    if (!key.startsWith(DRAFT_PREFIX)) continue
    try {
      const kept = JSON.parse(localStorage.getItem(key) ?? 'null') as KeptDraft | null
      if (!kept?.at || Date.now() - kept.at > DRAFT_TTL_MS) drop(key)
    } catch {
      drop(key)
    }
  }
}

export function readKept(holeKey: string): KeptDraft | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(draftKey(holeKey))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const kept = JSON.parse(raw) as KeptDraft
    if (kept?.players && Date.now() - kept.at <= DRAFT_TTL_MS) return kept
  } catch {
    // Unreadable: dropped below, like an expired one.
  }
  drop(draftKey(holeKey))
  return null
}

export function writeKept(holeKey: string, players: KeptDraft['players']) {
  try {
    if (Object.keys(players).length) localStorage.setItem(draftKey(holeKey), JSON.stringify({ at: Date.now(), players }))
    else localStorage.removeItem(draftKey(holeKey))
  } catch {
    // Private mode or full storage: the draft lives in memory only, as before.
  }
}

/** Tests only. */
export const _tarjetaDraftsTest = {
  resetSweep() {
    swept = false
  },
}

/**
 * Base handicaps fixed before the Calcutta (UX-28, §5.2). The Comité fixes
 * them («Fijar hándicaps»), or the tournament leaving setup does; from then a
 * change needs the Comité's reason (0046, update_player) and everyone sees
 * it: En vivo and the player's sheet read `handicapChanges`. The database
 * keeps the record (players.handicap_note: the handicap when they were fixed
 * and each change after it); this reads it the way the engine reads a
 * handicap, so a change undone, or one the rules never read, shows nothing.
 */
import type { TournamentSettings } from '../settings/schema'
import type { HandicapInputs, HandicapNote, Id, Snapshot, TournamentRow } from '../types'
import type { CoreState } from './types'
import { baseHandicap } from './compute'

type Base = Pick<CoreState['handicaps'][string], 'source' | 'base'>

/** Fixed by the Comité, or by the tournament leaving setup (one under way before 0046 has no moment, and is fixed too). */
export function handicapsLocked(t: Pick<TournamentRow, 'status' | 'handicapsLockedAt'>): boolean {
  return t.handicapsLockedAt != null || t.status !== 'setup'
}

/**
 * What a handicap is computed from, compared as 0046's handicap_used compares
 * it: an estimate's three scores, an index (the base when none was typed), or
 * the base. A base left over under an index is no change: no rule reads it.
 */
export function handicapUsed(h: HandicapInputs): string {
  if (h.handicapSource === 'estimate' && h.estimateInputs)
    return JSON.stringify(['estimate', h.estimateInputs.map((e) => [e.gross, e.rating, e.slope, e.par])])
  if (h.handicapSource === 'index') return JSON.stringify(['index', h.handicapIndex ?? h.baseHcp])
  return JSON.stringify(['manual', h.baseHcp])
}

export interface HandicapChange {
  playerId: Id
  /** The handicap the engine started from when they were fixed, and now. */
  from: Base
  to: Base
  /** Every change after they were fixed (the 20 latest), oldest first, with the Comité's reason. */
  changes: HandicapNote['changes']
}

/** The players whose handicap is not what it was when they were fixed, in the roster's order. */
export function handicapChanges(snapshot: Pick<Snapshot, 'players'>, settings: TournamentSettings): HandicapChange[] {
  const out: HandicapChange[] = []
  for (const p of [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const note = p.handicapNote
    if (!note?.changes.length) continue
    const was = baseHandicap(note.from, settings)
    const now = baseHandicap(p, settings)
    if (was.source === now.source && was.base === now.base) continue
    out.push({
      playerId: p.id,
      from: { source: was.source, base: was.base },
      to: { source: now.source, base: now.base },
      changes: note.changes,
    })
  }
  return out
}

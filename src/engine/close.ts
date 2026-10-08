/**
 * «Cerrar torneo» (MONEY-05): what must be settled before the Comité marks a
 * tournament Terminado or publishes its results, read on the tournament as
 * it will be once closed (Terminado; a Ronda rápida also finishes its live
 * rounds). Everything here blocks, except what people still owe: collecting
 * after the trip is normal, so that is a warning.
 */
import { t } from '../i18n/es-MX'
import { computeTournament } from './computeTournament'
import type { TournamentSettings } from './settings/schema'
import type { Snapshot } from './types'
import { fmt } from './games/payout'

const C = t.closeGate

export type CloseBlockerKind = 'openRounds' | 'tiebreaks' | 'unsoldLots' | 'unassigned' | 'badAssignments' | 'unsignedCards' | 'rejectedWrites'

export interface CloseBlocker {
  kind: CloseBlockerKind
  /** What is wrong and where the Comité fixes it. */
  text: string
}

export interface CloseCheck {
  blockers: CloseBlocker[]
  /** Not blocking: people who still owe (collected after the trip). */
  warnings: string[]
  ok: boolean
}

export interface CloseOptions {
  /** A Ronda rápida's «Terminar y publicar» finishes its live rounds first. */
  finishLiveRounds?: boolean
  /** Writes the server refused or found in conflict, still open (0026 `rejected_writes`). */
  openRejected: number
}

export function closeCheck(snapshot: Snapshot, settings: TournamentSettings, opts: CloseOptions): CloseCheck {
  const closed: Snapshot = {
    ...snapshot,
    tournament: { ...snapshot.tournament, status: 'finished' },
    rounds: snapshot.rounds.map((r) => (opts.finishLiveRounds && r.status === 'live' ? { ...r, status: 'finished' } : r)),
  }
  const state = computeTournament(closed, settings)
  const blockers: CloseBlocker[] = []
  const open = closed.rounds.filter((r) => r.status === 'live' || r.status === 'scheduled').map((r) => r.number)
  if (open.length) blockers.push({ kind: 'openRounds', text: C.openRounds(open) })
  const pending = state.flags.pendingSnakeTiebreaks.length
  if (pending) blockers.push({ kind: 'tiebreaks', text: C.tiebreaks(pending) })
  if (settings.modules.auction.enabled) {
    const unsold = closed.calcuttaLots.filter((l) => l.status !== 'sold')
    if (unsold.length) blockers.push({ kind: 'unsoldLots', text: C.unsoldLots(t.common.andList(unsold.map((l) => closed.players.find((p) => p.id === l.playerId)?.displayName ?? l.playerId))) })
  }
  const u = state.money.unassigned
  if (u.total > 0) blockers.push({ kind: 'unassigned', text: C.unassigned(fmt(u.total)) })
  const bad = u.assignments.filter((a) => a.status === 'over' || a.status === 'orphan').length
  if (bad) blockers.push({ kind: 'badAssignments', text: C.badAssignments(bad) })
  const finished = new Set(closed.rounds.filter((r) => r.status === 'finished').map((r) => r.id))
  const unsigned = state.flags.unsignedCards.filter((c) => finished.has(c.roundId)).length
  if (unsigned) blockers.push({ kind: 'unsignedCards', text: C.unsignedCards(unsigned) })
  if (opts.openRejected > 0) blockers.push({ kind: 'rejectedWrites', text: C.rejectedWrites(opts.openRejected) })

  const warnings: string[] = []
  const owed = state.money.accounts.filter((a) => a.due > 0 && a.from !== null)
  if (owed.length) {
    const people = new Set(owed.map((a) => a.from)).size
    warnings.push(C.owed(people, fmt(owed.reduce((s, a) => s + a.due, 0))))
  }
  return { blockers, warnings, ok: blockers.length === 0 }
}

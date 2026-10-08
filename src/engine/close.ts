/**
 * «Cerrar torneo» (MONEY-05): what must be settled before the Comité marks a
 * tournament Terminado or publishes its results, read on the tournament as
 * it will be once closed (Terminado; a Ronda rápida also finishes its live
 * rounds). It reads the same «play is over» flag as Dinero
 * (`money.unassigned.closing`), so it never blocks on a list Dinero does not
 * show. Three things only warn: what people still owe (collecting after the
 * trip is normal), lots never auctioned (they cash nothing, MONEY-11; whether
 * they should count as self-owned is Diego's open question, so the gate
 * forces no sale), and writes the server refused (nobody can clear them
 * until the REL-08 inbox exists, so they must not hold the close forever).
 */
import { t } from '../i18n/es-MX'
import { computeTournament } from './computeTournament'
import type { TournamentSettings } from './settings/schema'
import type { Snapshot } from './types'
import { fmt } from './games/payout'

const C = t.closeGate

export type CloseBlockerKind = 'missingRounds' | 'openRounds' | 'tiebreaks' | 'unassigned' | 'badAssignments' | 'unsignedCards'

export interface CloseBlocker {
  kind: CloseBlockerKind
  /** What is wrong and where the Comité fixes it. */
  text: string
}

export interface CloseCheck {
  blockers: CloseBlocker[]
  /** Not blocking: people who still owe, lots never auctioned, refused writes still open. */
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
  const warnings: string[] = []
  // Days the settings plan but nobody created: play is not over until they are played or cancelled.
  const made = new Set(closed.rounds.map((r) => r.number))
  const missing: number[] = []
  for (let n = 1; n <= settings.rounds && closed.rounds.length + missing.length < settings.rounds; n++) if (!made.has(n)) missing.push(n)
  if (missing.length) blockers.push({ kind: 'missingRounds', text: C.missingRounds(missing) })
  const open = closed.rounds.filter((r) => r.status === 'live' || r.status === 'scheduled').map((r) => r.number)
  if (open.length) blockers.push({ kind: 'openRounds', text: C.openRounds(open) })
  const pending = state.flags.pendingSnakeTiebreaks.length
  if (pending) blockers.push({ kind: 'tiebreaks', text: C.tiebreaks(pending) })
  if (settings.modules.auction.enabled) {
    const unsold = closed.calcuttaLots.filter((l) => l.status !== 'sold')
    if (unsold.length) warnings.push(C.unsoldLots(t.common.andList(unsold.map((l) => closed.players.find((p) => p.id === l.playerId)?.displayName ?? l.playerId))))
  }
  const u = state.money.unassigned
  if (u.total > 0) blockers.push({ kind: 'unassigned', text: C.unassigned(fmt(u.total)) })
  const bad = u.assignments.filter((a) => a.status === 'over' || a.status === 'orphan').length
  if (bad) blockers.push({ kind: 'badAssignments', text: C.badAssignments(bad) })
  const finished = new Set(closed.rounds.filter((r) => r.status === 'finished').map((r) => r.id))
  const unsigned = state.flags.unsignedCards.filter((c) => finished.has(c.roundId)).length
  if (unsigned) blockers.push({ kind: 'unsignedCards', text: C.unsignedCards(unsigned) })
  if (opts.openRejected > 0) warnings.push(C.rejectedWrites(opts.openRejected))

  const owed = state.money.accounts.filter((a) => a.due > 0 && a.from !== null)
  if (owed.length) {
    const people = new Set(owed.map((a) => a.from)).size
    warnings.push(C.owed(people, fmt(owed.reduce((s, a) => s + a.due, 0))))
  }
  return { blockers, warnings, ok: blockers.length === 0 }
}

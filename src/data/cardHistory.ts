/**
 * How each hole of a player's card got to what it holds (0062 `card_history`, TRUST-14): each value, who wrote it
 * (a player's short name, or the Comité with its reason) and when, from the server's history of the card. Every
 * member of the tournament reads every card's; never an account, a phone or a mutation. Online only: a link to
 * watch has no session to ask with, and never asks.
 */
import { isMissingFunction, rpc } from './rpc'

export interface HoleValue {
  strokes: number | null
  putts: number | null
  pickedUp: boolean
}

/** One step of a hole: what one write (one transaction) found and left. */
export interface CardStep {
  roundId: string
  /** The day's number. */
  round: number
  hole: number
  at: string
  /** Null: the hole had no capture before this step (its first) or after it (the Comité deleted it). */
  before: HoleValue | null
  after: HoleValue | null
  /** The short name of the player who wrote it, or null (an organizer who plays nobody, a script). */
  by: string | null
  /** The Comité decided it: its reason is on the row, or it deleted the hole. */
  comite: boolean
  reason: string | null
}

/** A hole whose card changed after its first capture, or that the Comité decided: its steps, oldest first. */
export interface HoleTrail {
  roundId: string
  round: number
  hole: number
  steps: CardStep[]
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

function value(x: unknown): HoleValue | null {
  if (!x || typeof x !== 'object') return null
  const v = x as Record<string, unknown>
  return { strokes: num(v.strokes), putts: num(v.putts), pickedUp: v.pickedUp === true }
}

function step(x: unknown): CardStep | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  const round = num(r.round)
  const hole = num(r.hole)
  const roundId = text(r.roundId)
  const at = text(r.at)
  if (round == null || hole == null || !roundId || !at) return null
  return {
    roundId,
    round,
    hole,
    at,
    before: value(r.before),
    after: value(r.after),
    by: text(r.by),
    comite: r.comite === true,
    reason: text(r.reason),
  }
}

/** The card's steps, or 'unavailable' on a database without 0062. */
export async function cardHistory(tournamentId: string, playerId: string): Promise<CardStep[] | 'unavailable'> {
  let data: unknown
  try {
    data = await rpc('card_history', { p_tournament_id: tournamentId, p_player_id: playerId })
  } catch (e) {
    if (isMissingFunction(e)) return 'unavailable'
    throw e
  }
  return (Array.isArray(data) ? data : []).map(step).filter((s): s is CardStep => s !== null)
}

/**
 * The holes worth reading, by day and hole: one that changed after its first capture, or one the Comité decided
 * (a paper card it typed in, a discrepancy it settled). A hole captured once by a player is the card itself.
 */
export function holeTrails(steps: readonly CardStep[]): HoleTrail[] {
  const byHole = new Map<string, HoleTrail>()
  for (const s of steps) {
    const key = `${s.round}:${s.roundId}:${s.hole}`
    const trail = byHole.get(key) ?? { roundId: s.roundId, round: s.round, hole: s.hole, steps: [] }
    trail.steps.push(s)
    byHole.set(key, trail)
  }
  return [...byHole.values()]
    .filter((h) => h.steps.length > 1 || h.steps.some((s) => s.comite))
    .map((h) => ({ ...h, steps: [...h.steps].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) }))
    .sort((a, b) => a.round - b.round || a.hole - b.hole)
}

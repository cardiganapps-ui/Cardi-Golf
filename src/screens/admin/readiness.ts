/**
 * «Para empezar» (UX-06): what a tournament still needs before its next
 * tee, read from the snapshot. A new organizer landed in a console of a dozen
 * sections with nothing saying what was missing, and players who joined by the
 * code found an empty face grid. Each line names what is done or what is
 * missing, and the Comité section that fixes it.
 */
import type { BracketState } from '../../engine/formats/bracket'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Course, Player, Round, Snapshot, Tee } from '../../engine/types'
import { t } from '../../i18n/es-MX'

export interface ReadinessItem {
  id: 'players' | 'pins' | 'rounds' | 'roundSetup' | 'card' | 'tees' | 'teams' | 'groups'
  done: boolean
  text: string
  /** The Comité section that fixes it. */
  to: 'jugadores' | 'campos' | 'rondas' | 'grupos' | 'equipos'
  /** Opens the section on this round (Grupos starts on the current one). */
  roundId?: string
}

export interface Entry {
  /** The players who have a PIN (players_with_pin); null while unknown, and the PIN line is left out. */
  pins: Set<string> | null
  /** Players confirmed-linked to an account: they get in signed in, without a PIN. */
  linked?: Set<string>
  /** Under match play, the bracket (state.bracket): who plays which round. */
  bracket?: BracketState | null
}

const days = (rounds: Round[]) => t.common.andList(rounds.map((r) => t.admin.ready.day(r.number)))

/** The rounds still to play, in order; the first is the one «Para empezar» prepares. */
export function nextRound(snapshot: Snapshot): Round | undefined {
  return [...snapshot.rounds].sort((a, b) => a.number - b.number).find((r) => r.status === 'scheduled' || r.status === 'live')
}

/** The tee a player plays in a round, the way the engine picks it (their choice, then their default on that course, then the course's first). */
function teeOf(snapshot: Snapshot, round: Round, course: Course, p: Player): Tee | undefined {
  const chosen = snapshot.roundTees.find((x) => x.roundId === round.id && x.playerId === p.id)
  const byId = (id: string | null | undefined) => (id ? course.tees.find((tee) => tee.id === id) : undefined)
  return (chosen ? byId(chosen.teeId) : undefined) ?? byId(p.defaultTeeId) ?? course.tees[0]
}

/** «Capturar a mano» starts a tee as par 4 on every hole with the stroke index in hole order: nobody's real card. */
const isBlank = (tee: Tee) => tee.holes.length > 0 && tee.holes.every((h) => h.par === 4 && h.strokeIndex === h.number)

type CardProblem = 'missing' | 'nine' | 'blank' | null
function cardProblem(snapshot: Snapshot, round: Round, course: Course): CardProblem {
  const players = snapshot.players
  const tees = players.length ? [...new Set(players.map((p) => teeOf(snapshot, round, course, p)))] : [course.tees[0]]
  if (tees.some((tee) => !tee || tee.holes.length === 0)) return 'missing'
  if (tees.some((tee) => tee!.holes.length < round.holes)) return tees.every((tee) => tee!.holes.length === 9) && round.holes === 18 ? 'nine' : 'missing'
  if (tees.some((tee) => isBlank(tee!))) return 'blank'
  return null
}

export function readiness(snapshot: Snapshot, settings: TournamentSettings, entry: Entry): ReadinessItem[] {
  const R = t.admin.ready
  const items: ReadinessItem[] = []
  const players = snapshot.players
  items.push({ id: 'players', done: players.length >= 2, text: players.length >= 2 ? R.players(players.length) : R.playersMissing, to: 'jugadores' })
  if (entry.pins && players.length) {
    const missing = players.filter((p) => !entry.pins!.has(p.id) && !entry.linked?.has(p.id)).length
    items.push({ id: 'pins', done: missing === 0, text: missing ? R.pinsMissing(missing) : R.pins, to: 'jugadores' })
  }

  // A cancelled round was created; it is not missing. Rounds past the days the tournament plays are flagged.
  const all = [...snapshot.rounds].sort((a, b) => a.number - b.number)
  const rounds = all.filter((r) => r.status !== 'cancelled')
  const short = settings.rounds - all.length
  const extra = rounds.length - settings.rounds
  items.push({
    id: 'rounds',
    done: short <= 0 && extra <= 0,
    text: short > 0 ? R.roundsMissing(short) : extra > 0 ? R.roundsExtra(rounds.length, settings.rounds) : R.rounds(all.length),
    to: 'rondas',
  })
  if (!rounds.length) return items

  const unset = rounds.filter((r) => !r.courseId || !r.date)
  items.push({ id: 'roundSetup', done: !unset.length, text: unset.length ? R.roundSetupMissing(days(unset)) : R.roundSetup, to: 'rondas' })

  // Each round's card, on the tees its players will play.
  const courses = new Map(snapshot.courses.map((c) => [c.id, c]))
  const withCourse = rounds.filter((r) => r.courseId && courses.has(r.courseId))
  if (withCourse.length) {
    const problems = withCourse.map((r) => [r, cardProblem(snapshot, r, courses.get(r.courseId!)!)] as const)
    const of = (k: CardProblem) => problems.filter(([, p]) => p === k).map(([r]) => r)
    const [missing, nine, blank] = [of('missing'), of('nine'), of('blank')]
    if (missing.length) items.push({ id: 'card', done: false, text: R.cardMissing(days(missing)), to: 'campos' })
    else if (nine.length) items.push({ id: 'card', done: false, text: R.cardNine(days(nine)), to: 'rondas' })
    else if (blank.length) items.push({ id: 'card', done: false, text: R.cardBlank(days(blank)), to: 'campos' })
    else items.push({ id: 'card', done: true, text: R.card, to: 'campos' })
  }

  // Teams, when the tournament plays as teams (drawn in Equipos; older tournaments used their pairs).
  if (settings.modules.individual.format === 'team') {
    const n = snapshot.teams.length || snapshot.pairs.length
    items.push({ id: 'teams', done: n > 0, text: n ? R.teams(n) : R.teamsMissing, to: 'equipos' })
  }

  // The next round to play: everyone on a tee of its course, and in a group.
  const next = nextRound(snapshot)
  if (!next || !players.length) return items
  const course = next.courseId ? courses.get(next.courseId) : undefined
  // One tee: everyone plays it, and Rondas has nothing to choose.
  if (course && course.tees.length > 1) {
    const onCourse = (teeId: string | null | undefined) => !!teeId && course.tees.some((tee) => tee.id === teeId)
    const noTee = players.filter((p) => {
      const chosen = snapshot.roundTees.find((x) => x.roundId === next.id && x.playerId === p.id)
      return !onCourse(chosen ? chosen.teeId : p.defaultTeeId)
    }).length
    items.push({ id: 'tees', done: !noTee, text: noTee ? R.teesMissing(noTee, next.number, course.tees[0]!.name) : R.tees(next.number), to: 'rondas' })
  }

  // Under match play the bracket says who plays: byes and the knocked out need no group.
  let expected: string[] = players.map((p) => p.id)
  if (entry.bracket) {
    const b = entry.bracket.rounds.find((r) => r.roundId === next.id)
    // The pairings are not known until the round before is decided: nothing to check yet.
    if (!b) return items
    expected = b.matches.filter((m) => m.sides[1]).flatMap((m) => [...m.sides[0].playerIds, ...m.sides[1]!.playerIds])
    if (!expected.length) return items
  }
  const grouped = new Set(snapshot.groups.filter((g) => g.roundId === next.id).flatMap((g) => g.playerIds))
  const out = expected.filter((id) => !grouped.has(id)).length
  items.push({
    id: 'groups',
    done: !out,
    text: out === expected.length ? R.groupsMissing(next.number) : out ? R.groupsPartial(out, next.number) : R.groups(next.number),
    to: 'grupos',
    roundId: next.id,
  })
  return items
}

/**
 * Engine warnings «Para empezar» already lists, so the Torneo tab counts each
 * once: a round without a course, a team format with no teams, a bracket
 * with too few players.
 */
export const coveredByChecklist = (warning: string) => /sin campo cargado|todavía no hay equipos sorteados|suficientes jugadores para armar el cuadro/.test(warning)

/** The Torneo tab's count while the tournament is set up: the open lines plus what else the engine warns about. */
export function setupBadge(items: ReadinessItem[], warnings: string[], missingModules: number): number {
  return items.filter((i) => !i.done).length + warnings.filter((w) => !coveredByChecklist(w)).length + missingModules
}

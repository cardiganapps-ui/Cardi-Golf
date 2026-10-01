/**
 * «Para empezar» (UX-06): what a tournament still needs before its first
 * tee, read from the snapshot. A new organizer landed in a console of a dozen
 * sections with nothing saying what was missing, and players who joined by the
 * code found an empty face grid. Each line names what is done or what is
 * missing, and the Comité section that fixes it.
 */
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Round, Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'

export interface ReadinessItem {
  id: 'players' | 'pins' | 'rounds' | 'roundSetup' | 'card' | 'tees' | 'groups'
  done: boolean
  text: string
  /** The Comité section that fixes it. */
  to: 'jugadores' | 'campos' | 'rondas' | 'grupos'
}

const days = (rounds: Round[]) => t.common.andList(rounds.map((r) => t.admin.ready.day(r.number)))

/**
 * `pins`: the players who have a PIN (an RPC), or null while that is unknown;
 * the PIN line is left out rather than guessed.
 */
export function readiness(snapshot: Snapshot, settings: TournamentSettings, pins: Set<string> | null): ReadinessItem[] {
  const R = t.admin.ready
  const items: ReadinessItem[] = []
  const players = snapshot.players
  items.push({ id: 'players', done: players.length >= 2, text: players.length >= 2 ? R.players(players.length) : R.playersMissing, to: 'jugadores' })
  if (pins && players.length) {
    const missing = players.filter((p) => !pins.has(p.id)).length
    items.push({ id: 'pins', done: missing === 0, text: missing ? R.pinsMissing(missing) : R.pins, to: 'jugadores' })
  }

  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled').sort((a, b) => a.number - b.number)
  const short = settings.rounds - rounds.length
  items.push({ id: 'rounds', done: short <= 0, text: short > 0 ? R.roundsMissing(short) : R.rounds(rounds.length), to: 'rondas' })
  if (!rounds.length) return items

  const unset = rounds.filter((r) => !r.courseId || !r.date)
  items.push({ id: 'roundSetup', done: !unset.length, text: unset.length ? R.roundSetupMissing(days(unset)) : R.roundSetup, to: 'rondas' })

  // A course is ready when some tee has a par and a stroke index for every hole the round plays.
  const courses = new Map(snapshot.courses.map((c) => [c.id, c]))
  const withCourse = rounds.filter((r) => r.courseId && courses.has(r.courseId))
  const noCard = withCourse.filter((r) => !courses.get(r.courseId!)!.tees.some((tee) => tee.holes.length >= r.holes && tee.holes.slice(0, r.holes).every((h) => h.par > 0 && h.strokeIndex > 0)))
  if (withCourse.length) items.push({ id: 'card', done: !noCard.length, text: noCard.length ? R.cardMissing(days(noCard)) : R.card, to: 'campos' })

  // The next round to play: everyone on a tee of its course, and in a group.
  const next = rounds.find((r) => r.status === 'scheduled' || r.status === 'live')
  if (!next || !players.length) return items
  const course = next.courseId ? courses.get(next.courseId) : undefined
  if (course) {
    const onCourse = (teeId: string | null | undefined) => !!teeId && course.tees.some((tee) => tee.id === teeId)
    const noTee = players.filter((p) => {
      const chosen = snapshot.roundTees.find((x) => x.roundId === next.id && x.playerId === p.id)
      return !onCourse(chosen ? chosen.teeId : p.defaultTeeId)
    }).length
    items.push({ id: 'tees', done: !noTee, text: noTee ? R.teesMissing(noTee, next.number) : R.tees(next.number), to: 'rondas' })
  }
  const grouped = new Set(snapshot.groups.filter((g) => g.roundId === next.id).flatMap((g) => g.playerIds))
  const out = players.filter((p) => !grouped.has(p.id)).length
  items.push({ id: 'groups', done: !out, text: out === players.length ? R.groupsMissing(next.number) : out ? R.groupsPartial(out, next.number) : R.groups(next.number), to: 'grupos' })
  return items
}

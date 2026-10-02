/**
 * «Para empezar» (UX-06): what a tournament still needs before its next
 * tee, read from the snapshot. A new organizer landed in a console of a dozen
 * sections with nothing saying what was missing, and players who joined by the
 * code found an empty face grid. Each line names what is done or what is
 * missing, and the Comité section that fixes it.
 */
import { teeById, teeForPlayerRound } from '../../engine/core/compute'
import type { BracketState } from '../../engine/formats/bracket'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Course, Round, Snapshot, Tee } from '../../engine/types'
import { t } from '../../i18n/es-MX'

export type ReadinessId = 'players' | 'pins' | 'rounds' | 'roundSetup' | 'card' | 'foreignTees' | 'teams' | 'pairs' | 'bracket' | 'tees' | 'groups'

export interface ReadinessItem {
  id: ReadinessId
  done: boolean
  text: string
  /** The Comité section that fixes it. */
  to: 'jugadores' | 'campos' | 'rondas' | 'grupos' | 'equipos' | 'torneo'
  /** Opens the section on this round (Grupos starts on the current one). */
  roundId?: string
  /** Torneo opens on this tab: Reglas holds the days. */
  tab?: 'reglas'
  /** The days (round numbers) an open line is about: an engine warning about one of them says the same thing. */
  days?: number[]
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
const numbers = (rounds: Round[]) => rounds.map((r) => r.number)

/** The rounds still to play, in order; the first is the one «Para empezar» prepares. */
export function nextRound(snapshot: Snapshot): Round | undefined {
  return [...snapshot.rounds].sort((a, b) => a.number - b.number).find((r) => r.status === 'scheduled' || r.status === 'live')
}

/** How the main game plays in teams: a team format in teams, fourball match play in pairs. Both are drawn in Equipos. */
export function teamPlay(settings: TournamentSettings): 'teams' | 'pairs' | null {
  const main = settings.modules.individual
  if (main.format === 'team') return 'teams'
  if (main.format === 'matchPlay' && main.formatOptions.matchMode === 'fourball') return 'pairs'
  return null
}

/** Where a line goes: its section, on its day (Grupos) or its tab (Torneo). */
export function hrefOf(slug: string, item: ReadinessItem): string {
  const query = item.roundId ? `?ronda=${item.roundId}` : item.tab ? `?pestana=${item.tab}` : ''
  return `/t/${slug}/admin/${item.to}${query}`
}

/**
 * The tees a round's players will play, picked exactly as the engine picks
 * them (`teeForPlayerRound`), and how many were given a tee of another course
 * for that day: the engine plays that one, or par 4 everywhere when its
 * course isn't loaded.
 */
function teesPlayed(snapshot: Snapshot, round: Round, course: Course, loaded: Map<string, Tee>): { tees: Array<Tee | null>; foreign: number } {
  const tees = new Set<Tee | null>()
  let foreign = 0
  for (const p of snapshot.players) {
    const tee = teeForPlayerRound(snapshot, round, p, loaded)
    const chosen = snapshot.roundTees.some((x) => x.roundId === round.id && x.playerId === p.id)
    if (chosen && tee?.courseId !== course.id) foreign++
    else tees.add(tee)
  }
  if (!snapshot.players.length) tees.add(course.tees[0] ?? null)
  return { tees: [...tees], foreign }
}

/** «Capturar a mano» starts a tee as par 4 on every hole with the stroke index in hole order. */
const parsUntouched = (tee: Tee) => tee.holes.every((h) => h.par === 4)
/** A stroke index equal to the hole number on every hole is nobody's real card: it was never typed. */
const indexUntouched = (tee: Tee) => tee.holes.length > 0 && tee.holes.every((h) => h.strokeIndex === h.number)

type CardProblem = 'missing' | 'nine' | 'blank' | 'noIndex' | null
function cardProblem(tees: Array<Tee | null>, round: Round): CardProblem {
  if (tees.some((tee) => !tee || tee.holes.length === 0)) return 'missing'
  const loaded = tees as Tee[]
  if (loaded.some((tee) => tee.holes.length < round.holes)) return loaded.every((tee) => tee.holes.length === 9) && round.holes === 18 ? 'nine' : 'missing'
  if (loaded.some((tee) => indexUntouched(tee) && parsUntouched(tee))) return 'blank'
  if (loaded.some(indexUntouched)) return 'noIndex'
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

  // Under match play the bracket sets how many rounds it takes: 1 v N, … up to a power of two, halved each day.
  const bracket = entry.bracket ?? null
  const firstMatches = bracket?.rounds[0]?.matches.length ?? 0
  const needed = firstMatches ? Math.round(Math.log2(firstMatches * 2)) : 0

  // A cancelled round was created; it is not missing. Rounds past the days are flagged, unless the bracket needs them.
  const all = [...snapshot.rounds].sort((a, b) => a.number - b.number)
  const rounds = all.filter((r) => r.status !== 'cancelled')
  const short = settings.rounds - all.length
  const extra = rounds.length - Math.max(settings.rounds, needed)
  if (short > 0) items.push({ id: 'rounds', done: false, text: R.roundsMissing(short), to: 'rondas' })
  else if (!rounds.length) items.push({ id: 'rounds', done: false, text: R.roundsCancelled(all.length), to: 'rondas' })
  else if (extra > 0) items.push({ id: 'rounds', done: false, text: R.roundsExtra(rounds.length, settings.rounds, extra), to: 'torneo', tab: 'reglas' })
  else items.push({ id: 'rounds', done: true, text: R.rounds(all.length), to: 'rondas' })
  if (!rounds.length) return items

  const unset = rounds.filter((r) => !r.courseId || !r.date)
  items.push({ id: 'roundSetup', done: !unset.length, text: unset.length ? R.roundSetupMissing(days(unset)) : R.roundSetup, to: 'rondas', days: numbers(unset) })

  // Each round's card, on the tees its players will play; a tee of another course is its own line.
  const courses = new Map(snapshot.courses.map((c) => [c.id, c]))
  const loaded = teeById(snapshot)
  const withCourse = rounds.filter((r) => r.courseId && courses.has(r.courseId))
  if (withCourse.length) {
    const read = withCourse.map((round) => ({ round, ...teesPlayed(snapshot, round, courses.get(round.courseId!)!, loaded) }))
    const of = (k: CardProblem) => read.filter((x) => cardProblem(x.tees, x.round) === k).map((x) => x.round)
    const lines: Array<[Round[], (d: string) => string, ReadinessItem['to']]> = [
      [of('missing'), R.cardMissing, 'campos'],
      [of('nine'), R.cardNine, 'rondas'],
      [of('blank'), R.cardBlank, 'campos'],
      [of('noIndex'), R.cardNoIndex, 'campos'],
    ]
    const open = lines.find(([rs]) => rs.length)
    items.push(open ? { id: 'card', done: false, text: open[1](days(open[0])), to: open[2], days: numbers(open[0]) } : { id: 'card', done: true, text: R.card, to: 'campos' })
    const foreign = read.filter((x) => x.foreign).map((x) => x.round)
    if (foreign.length) items.push({ id: 'foreignTees', done: false, text: R.teesForeign(days(foreign)), to: 'rondas', days: numbers(foreign) })
  }

  // Teams, when the main game plays as teams: drawn in Equipos (older tournaments used their pairs, and so does the engine).
  const kind = settings.modules.individual.enabled ? teamPlay(settings) : null
  if (kind) {
    const teams = snapshot.teams.length ? snapshot.teams.map((x) => x.playerIds) : snapshot.pairs.map((p) => [p.player1Id, p.player2Id])
    const inTeam = new Set(teams.flat())
    const loose = players.filter((p) => !inTeam.has(p.id)).length
    const pairs = kind === 'pairs'
    // A fourball match is two pairs, and a pair is two players: teams of 4 left from a team format, or the odd
    // one of a 7-player draw (2, 2, 2, 1), are not pairs, and the engine would play them as they are.
    const notPairs = pairs ? teams.filter((x) => x.length !== 2).length : 0
    const enough = teams.length - notPairs >= (pairs ? 2 : 1)
    items.push({
      id: kind,
      done: enough && !loose && !notPairs,
      text: notPairs
        ? R.pairsNotTwo(notPairs)
        : !enough
          ? pairs
            ? R.pairsMissing
            : R.teamsMissing
          : loose
            ? pairs
              ? R.pairsLoose(loose)
              : R.teamsLoose(loose)
            : pairs
              ? R.pairs(teams.length)
              : R.teams(teams.length),
      to: 'equipos',
    })
  }

  // The days are in Torneo › Reglas: the knockout can't be played out in fewer.
  if (needed > settings.rounds) items.push({ id: 'bracket', done: false, text: R.bracketDays(needed, settings.rounds), to: 'torneo', tab: 'reglas' })

  // The next round to play: everyone on a tee of its course, and in a group.
  const next = nextRound(snapshot)
  if (!next || !players.length) return items
  const course = next.courseId ? courses.get(next.courseId) : undefined
  // One tee: everyone plays it, and Rondas has nothing to choose.
  if (course && course.tees.length > 1) {
    const onCourse = (teeId: string | null) => !!teeId && course.tees.some((tee) => tee.id === teeId)
    // A tee chosen for the day is played (one of another course is the line above); without one, the default on this course, else the first tee.
    const noTee = players.filter((p) => !snapshot.roundTees.some((x) => x.roundId === next.id && x.playerId === p.id) && !onCourse(p.defaultTeeId)).length
    items.push({ id: 'tees', done: !noTee, text: noTee ? R.teesMissing(noTee, next.number, course.tees[0]!.name) : R.tees(next.number), to: 'rondas', days: [next.number] })
  }

  const grouped = new Set(snapshot.groups.filter((g) => g.roundId === next.id).flatMap((g) => g.playerIds))
  const groupsLine = (done: boolean, text: string): ReadinessItem => ({ id: 'groups', done, text, to: 'grupos', roundId: next.id, days: [next.number] })
  if (!bracket) {
    const out = players.filter((p) => !grouped.has(p.id)).length
    items.push(groupsLine(!out, out === players.length ? R.groupsMissing(next.number) : out ? R.groupsPartial(out, next.number) : R.groups(next.number)))
    return items
  }

  // Under match play the groups are the bracket's matches for the day.
  const b = bracket.rounds.find((r) => r.roundId === next.id)
  if (!b) {
    // The bracket stopped on an earlier day: over (a champion), or a match there has no winner and the Comité decides who goes through.
    const last = bracket.rounds.at(-1)
    const undecided = last && !bracket.champion ? last.matches.filter((m) => m.sides[1] && !m.winner).length : 0
    // Whoever the Comité sends through, it groups by hand: once the day has groups, the decision is made.
    if (last && undecided) items.push(grouped.size ? groupsLine(true, R.groups(next.number)) : groupsLine(false, R.bracketUndecided(last.name, undecided, next.number)))
    return items
  }
  const real = b.matches.filter((m) => m.sides[1])
  // A match is pending until a group holds exactly its two sides.
  const pending = real.filter((m) => m.pending).length
  // A bye skips the day only if the bracket goes on to a later one.
  const later = rounds.some((r) => r.number > next.number)
  const byes = later ? [] : b.matches.filter((m) => !m.sides[1]).flatMap((m) => m.sides[0].playerIds)
  const byesOut = byes.filter((id) => !grouped.has(id)).length
  const expected = [...real.flatMap((m) => [...m.sides[0].playerIds, ...m.sides[1]!.playerIds]), ...byes]
  if (!expected.length) return items
  const none = expected.every((id) => !grouped.has(id))
  items.push(
    groupsLine(
      !pending && !byesOut,
      none ? R.groupsMissing(next.number) : pending ? R.groupsMatches(pending, next.number) : byesOut ? R.groupsPartial(byesOut, next.number) : R.groups(next.number),
    ),
  )
  return items
}

/** What «Listo para jugar» says was checked: the lines on the list. */
export function checkedText(items: ReadinessItem[]): string {
  return t.common.andList([...new Set(items.map((i) => t.admin.ready.checked[i.id]))])
}

/**
 * An engine warning «Para empezar» already says, so the Torneo tab counts it
 * once: only while the line that says it is open, and only for its day. A
 * day with no course (or a tee whose course isn't loaded), a team format
 * with no teams, a match-play group that is not a match (for fourball, also
 * while the pairs aren't drawn). The bracket's own warnings never reach the
 * engine's list, so none is claimed. Anything else counts on its own.
 */
export function coveredByChecklist(warning: string, items: ReadinessItem[]): boolean {
  const open = items.filter((i) => !i.done)
  const day = Number(/^Día (\d+)[,:]/.exec(warning)?.[1] ?? NaN)
  const about = (ids: ReadinessId[]) => open.some((i) => ids.includes(i.id) && !!i.days?.includes(day))
  if (/sin campo cargado/.test(warning)) return about(['roundSetup', 'card', 'foreignTees'])
  if (/un partido individual necesita exactamente dos jugadores/.test(warning)) return about(['groups'])
  if (/un fourball necesita dos parejas/.test(warning)) return about(['groups']) || open.some((i) => i.id === 'pairs')
  if (/todavía no hay equipos sorteados/.test(warning)) return open.some((i) => i.id === 'teams')
  return false
}

/** The Torneo tab's count while the tournament is set up: the open lines plus what else the engine warns about. */
export function setupBadge(items: ReadinessItem[], warnings: string[], missingModules: number): number {
  return items.filter((i) => !i.done).length + warnings.filter((w) => !coveredByChecklist(w, items)).length + missingModules
}

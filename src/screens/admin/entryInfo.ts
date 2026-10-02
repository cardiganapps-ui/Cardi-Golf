/**
 * Who can get into the tournament on their own: the players with a PIN
 * (players_with_pin) and those confirmed-linked to an account, who enter
 * signed in. «Para empezar» and the Torneo tab's count read one shared
 * answer, so they never disagree.
 *
 * It is asked again whenever a reader opens (the Torneo card, the Comité),
 * when the players' rows change (a link made or undone on another phone
 * arrives with the realtime reload: `playersKey`), and when this phone sets
 * a PIN or links a profile (`entryChanged`, called by those writes in
 * `src/data`). A reload that changes no player (a score, a payment) asks
 * nothing. A PIN set on another phone has no realtime event: the next time
 * the card opens, it is asked for. Readers that open together share one
 * request. Answers are kept per tournament, so a late answer about one never
 * blanks another's card.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { playersWithPin } from '../../data/api'
import { onEntryChanged } from '../../data/entryEvents'
import { tournamentProfiles } from '../../data/profiles'
import { useTournament, type TournamentData } from '../../data/tournamentStore'

export interface EntryInfo {
  pins: Set<string>
  linked: Set<string>
}

interface Shared {
  /** The latest answer about each tournament. */
  answers: Readonly<Record<string, EntryInfo>>
  /** Bumped by every change this phone makes: each reader asks again. */
  stamp: number
}
let shared: Shared = { answers: {}, stamp: 0 }
const listeners = new Set<() => void>()
function update(next: Partial<Shared>) {
  shared = { ...shared, ...next }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
const read = () => shared

onEntryChanged(() => update({ stamp: shared.stamp + 1 }))

/** Requests still on their way; a settled one is dropped, so the next reader asks again. */
const inflight = new Set<string>()
/** The newest request per tournament: an older answer that lands late is not applied. */
const newest = new Map<string, number>()
let seq = 0
function ask(tournamentId: string, key: string) {
  if (inflight.has(key)) return
  inflight.add(key)
  const mine = ++seq
  newest.set(tournamentId, mine)
  // Without the links, a linked player only reads as missing a PIN; without the PINs nothing is known.
  Promise.all([playersWithPin(tournamentId), tournamentProfiles(tournamentId).catch(() => [])])
    .then(([pins, profiles]) => {
      if (newest.get(tournamentId) !== mine) return
      const info = { pins, linked: new Set(profiles.filter((x) => x.status === 'confirmed').map((x) => x.playerId)) }
      update({ answers: { ...shared.answers, [tournamentId]: info } })
    })
    // No signal: the last answer stands, and the next reader asks again.
    .catch(() => undefined)
    .finally(() => inflight.delete(key))
}

/**
 * Null while unknown (loading, no signal): the PIN line waits and «Listo
 * para jugar» is not said. `enabled: false` reads without asking (a reader
 * that shows nothing asks nothing). A design fixture (the store's tournament
 * is `fixture:<name>`, as the shell reads it) has no server: its players
 * count as able to get in.
 */
export function useEntryInfo(tournamentId: string, data: TournamentData | null | undefined, { enabled = true }: { enabled?: boolean } = {}): EntryInfo | null {
  const { answers, stamp } = useSyncExternalStore(subscribe, read)
  const fixture = useTournament((s) => s.tournamentId?.startsWith('fixture:') ?? false)
  const playersKey = data?.playersKey
  useEffect(() => {
    if (fixture || !enabled || !playersKey) return
    ask(tournamentId, `${tournamentId}|${playersKey}|${stamp}`)
  }, [tournamentId, playersKey, stamp, fixture, enabled])
  if (fixture) return { pins: new Set(data?.snapshot.players.map((p) => p.id)), linked: new Set() }
  return answers[tournamentId] ?? null
}

/**
 * Who can get into the tournament on their own: the players with a PIN
 * (players_with_pin) and those confirmed-linked to an account, who enter
 * signed in. «Para empezar» and the Torneo tab's count read one shared
 * answer, so they never disagree.
 *
 * It is asked again whenever a reader opens (the Torneo card, the Comité),
 * when the players reload (a link made or undone on another phone arrives
 * that way), and when this phone sets a PIN or links a profile
 * (`entryChanged`, called by those writes in `src/data`). A PIN set on
 * another phone has no realtime event: the next time the card opens, it is
 * asked for. Readers that open together share one request.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { playersWithPin } from '../../data/api'
import { onEntryChanged } from '../../data/entryEvents'
import { tournamentProfiles } from '../../data/profiles'
import { useTournament } from '../../data/tournamentStore'
import type { Player } from '../../engine/types'

export interface EntryInfo {
  pins: Set<string>
  linked: Set<string>
}

interface Shared {
  /** The latest answer and the tournament it is about. */
  answer: { tournamentId: string; info: EntryInfo } | null
  /** Bumped by every change this phone makes: each reader asks again. */
  stamp: number
}
let shared: Shared = { answer: null, stamp: 0 }
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

/** Each reload of the players is a new list: numbered, so readers given the same list share a request. */
const lists = new WeakMap<object, number>()
let listCount = 0
function listNumber(players: Player[]): number {
  let n = lists.get(players)
  if (n == null) lists.set(players, (n = ++listCount))
  return n
}

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
      update({ answer: { tournamentId, info: { pins, linked: new Set(profiles.filter((x) => x.status === 'confirmed').map((x) => x.playerId)) } } })
    })
    // No signal: the last answer stands, and the next reader asks again.
    .catch(() => undefined)
    .finally(() => inflight.delete(key))
}

/**
 * Null while unknown (loading, no signal): the PIN line waits and «Listo
 * para jugar» is not said. `enabled: false` reads without asking. A design
 * fixture (the store's tournament is `fixture:<name>`, as the shell reads
 * it) has no server: its players count as able to get in.
 */
export function useEntryInfo(tournamentId: string, players: Player[] | undefined, { enabled = true }: { enabled?: boolean } = {}): EntryInfo | null {
  const { answer, stamp } = useSyncExternalStore(subscribe, read)
  const fixture = useTournament((s) => s.tournamentId?.startsWith('fixture:') ?? false)
  const list = players ? listNumber(players) : 0
  useEffect(() => {
    if (fixture || !enabled || !list) return
    ask(tournamentId, `${tournamentId}|${list}|${stamp}`)
  }, [tournamentId, list, stamp, fixture, enabled])
  if (fixture) return { pins: new Set(players?.map((p) => p.id)), linked: new Set() }
  return answer?.tournamentId === tournamentId ? answer.info : null
}

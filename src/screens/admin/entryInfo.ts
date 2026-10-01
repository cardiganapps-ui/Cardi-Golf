/**
 * Who can get into the tournament on their own: the players with a PIN
 * (players_with_pin) and those confirmed-linked to an account, who enter
 * signed in. «Para empezar» and the Torneo tab's count read it from one
 * request, asked again when the Comité sets a PIN or links a profile
 * (`entryChanged`) and when a player is added.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { playersWithPin } from '../../data/api'
import { tournamentProfiles } from '../../data/profiles'

export interface EntryInfo {
  pins: Set<string>
  linked: Set<string>
}

let version = 0
const listeners = new Set<() => void>()
/** A PIN was set or a profile linked: the next read asks the server again. */
export function entryChanged() {
  version++
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** One request per tournament, player count and change, however many readers. */
const requests = new Map<string, Promise<EntryInfo>>()
function ask(tournamentId: string, key: string): Promise<EntryInfo> {
  let p = requests.get(key)
  if (!p) {
    // Without the links, a linked player only reads as missing a PIN; without the PINs nothing is known.
    p = Promise.all([playersWithPin(tournamentId), tournamentProfiles(tournamentId).catch(() => [])]).then(([pins, profiles]) => ({
      pins,
      linked: new Set(profiles.filter((x) => x.status === 'confirmed').map((x) => x.playerId)),
    }))
    for (const k of requests.keys()) if (k.startsWith(`${tournamentId}|`)) requests.delete(k)
    requests.set(key, p)
    // A failed answer is asked for again next time.
    p.catch(() => requests.delete(key))
  }
  return p
}

/**
 * Null while unknown (loading, no signal): the PIN line waits and «Listo para
 * jugar» is not said. A design fixture has no server; its players count as
 * able to get in.
 */
export function useEntryInfo(tournamentId: string, playerIds: string[]): EntryInfo | null {
  const v = useSyncExternalStore(subscribe, () => version)
  const fixture = tournamentId.startsWith('fixture:')
  const key = `${tournamentId}|${playerIds.length}|${v}`
  const [known, setKnown] = useState<{ tournamentId: string; info: EntryInfo } | null>(null)
  useEffect(() => {
    if (fixture) return
    let alive = true
    ask(tournamentId, key)
      .then((info) => alive && setKnown({ tournamentId, info }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [tournamentId, key, fixture])
  if (fixture) return { pins: new Set(playerIds), linked: new Set() }
  // While a new answer is on its way, the last one for this tournament stands.
  return known?.tournamentId === tournamentId ? known.info : null
}

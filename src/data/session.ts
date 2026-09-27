/** Remembers the last tournament this device opened (per-device convenience only). */
const KEY = 'cardi-golf:last-tournament'

export interface LastTournament {
  slug: string
  name: string
}

export function getLastTournament(): LastTournament | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LastTournament) : null
  } catch {
    return null
  }
}

export function setLastTournament(v: LastTournament | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

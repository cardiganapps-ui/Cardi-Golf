/**
 * Who this session is in a tournament (`my_membership`, read by the gate), and the last tournament this device
 * opened (per-device convenience only). `Me` lived in a screen, so the data layer's cache of the boards
 * imported its type from one (ARCH-20); src/data and src/engine never import from the screens.
 */
const KEY = 'cardi-golf:last-tournament'

export interface Me {
  playerId: string | null
  isOrganizer: boolean
  /**
   * May use the Comité console: an organizer's account, or a player the Comité made one of it
   * (`players.is_admin`). «Admin» in code is the Admin de Polo only (`is_platform_admin`, ARCH-20).
   */
  isComite: boolean
  /**
   * How this session is in the tournament: its profile's confirmed link, this
   * device's PIN, or 'platform' — the Polo admin visiting a tournament he does
   * not belong to (read always; Comité unless it is Protegido and locked).
   */
  via?: 'profile' | 'device' | 'platform' | null
  /** Protegido: nobody deletes it; the platform admin needs an unlock to write. */
  protected?: boolean
  /** Platform visits: until when the admin's unlock lasts (ISO), if unlocked. */
  unlockedUntil?: string | null
}

export interface LastTournament {
  slug: string
  name: string
  /** When this device last opened it: a launch of the installed app goes back to it while it is recent (PWA-09). */
  at?: number
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

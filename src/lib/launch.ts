/**
 * The installed app opens on Home, its start URL. Once per launch it goes straight back to the tournament
 * it was in while that one is recent, or, on the first launch of an app installed from a tournament's page
 * (an iPhone's starts with nothing of Safari's), to that tournament (PWA-09). It cost every cold start on
 * the course a tap, and on an iPhone a code the player may never have had. Home stays where it is when the
 * app goes there itself.
 */
import { getLastTournament } from '../data/session'
import { TOURNAMENT_SEGMENT } from './appManifest'
import { isStandalone } from './install'

/** Set once per launch: the browser keeps session storage until the app is closed. */
const LAUNCHED = 'cardi-golf:launched'
/** A tournament trip: one opened within this long is where a launch goes back to. */
export const RESUME_MS = 4 * 24 * 60 * 60 * 1000

/** The tournament (slug or code) a launch of the installed app opens, if any; Home's own visits get none. */
export function launchTarget(search: string, now = Date.now()): string | null {
  if (!isStandalone()) return null
  try {
    if (sessionStorage.getItem(LAUNCHED)) return null
    sessionStorage.setItem(LAUNCHED, '1')
  } catch {
    return null
  }
  const last = getLastTournament()
  // This phone was in a tournament: back to it while it is recent; an old one is Home's to offer.
  if (last) return last.at != null && now - last.at < RESUME_MS ? last.slug : null
  // Nothing here yet: the tournament the app was installed from (its manifest's start URL names it).
  const t = new URLSearchParams(search).get('t')
  return t && TOURNAMENT_SEGMENT.test(t) ? t : null
}

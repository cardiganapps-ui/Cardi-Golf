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
  return resumeTarget(search, now)
}

/**
 * Whether opening this page will go on into a tournament, asked before the router renders and without using up
 * the launch: the tournament's screens then load beside Home's instead of after them (PERF-02).
 */
export function launchesIntoTournament(path: string, search: string, now = Date.now()): boolean {
  if (/^\/(?:t\/|continuar(?:\/|$))/.test(path)) return true
  if (path !== '/' || !isStandalone()) return false
  try {
    if (sessionStorage.getItem(LAUNCHED)) return false
  } catch {
    return false
  }
  return resumeTarget(search, now) != null
}

function resumeTarget(search: string, now: number): string | null {
  const last = getLastTournament()
  // This phone was in a tournament: back to it while it is recent; an old one is Home's to offer.
  if (last) return last.at != null && now - last.at < RESUME_MS ? last.slug : null
  // Nothing here yet: the tournament the app was installed from (its manifest's start URL names it).
  const t = new URLSearchParams(search).get('t')
  return t && TOURNAMENT_SEGMENT.test(t) ? t : null
}

/**
 * What a shortcut of the installed app opens in the last tournament (PWA-14): En vivo is its own page. `tv` is
 * `/tv` typed or bookmarked with no tournament in it (ARCH-19): that tournament's TV.
 */
export type ContinueTab = '' | 'tarjeta' | 'tv'

/** The last tournament this phone opened, on that tab; Home when there is none. */
function continuePath(tab: ContinueTab): string {
  const last = getLastTournament()
  if (typeof last?.slug !== 'string' || !last.slug) return '/'
  return `/t/${last.slug}${tab ? `/${tab}` : ''}`
}

/**
 * Where a shortcut goes (`/continuar`, `/continuar/tarjeta`; the manifest's «Mi tarjeta» and «En vivo»,
 * PWA-14): the last tournament this phone opened, however long ago, since the person asked for it; with none,
 * Home. The shortcut is the launch, so Home stays Home afterwards.
 */
export function continueTarget(tab: ContinueTab): string {
  try {
    sessionStorage.setItem(LAUNCHED, '1')
  } catch {
    // Nothing kept: Home may go back to the tournament once, which is where this went anyway.
  }
  return continuePath(tab)
}

interface LaunchQueue {
  setConsumer(consumer: (params: { targetURL?: string }) => void): void
}
/** The page as it was opened: the launch that opened it is no launch into an open app. */
const OPENED_AT = typeof location === 'undefined' ? '' : location.href
let firstLaunch = true

/**
 * Where a launch into the open app goes (PWA-14): a shortcut's tournament and tab, or the page it names; null
 * for another site's, none, or the page already on screen.
 */
export function launchPath(target: string | undefined, here: { origin: string; pathname: string; search: string; hash: string }): string | null {
  if (!target) return null
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return null
  }
  if (url.origin !== here.origin) return null
  const shortcut = /^\/continuar(?:\/(tarjeta))?\/?$/.exec(url.pathname)
  const to = shortcut ? continuePath(shortcut[1] === 'tarjeta' ? 'tarjeta' : '') : `${url.pathname}${url.search}${url.hash}`
  return to === `${here.pathname}${here.search}${here.hash}` ? null : to
}

/**
 * `launch_handler: focus-existing` (the manifest, PWA-14): a launch while the app is open (a shortcut, a link)
 * brings that window forward without loading it again, and hands the page its URL. The page goes there in
 * place, as a tap inside it would, so a hole half typed on the Tarjeta stays on the phone (PWA-05). The launch
 * that opened the page is its own, already on screen.
 */
export function listenForLaunches(go: (path: string) => void): void {
  const queue = (globalThis as { launchQueue?: LaunchQueue }).launchQueue
  queue?.setConsumer((params) => {
    const own = firstLaunch && params.targetURL === OPENED_AT
    firstLaunch = false
    if (own) return
    const to = launchPath(params.targetURL, location)
    if (to) go(to)
  })
}

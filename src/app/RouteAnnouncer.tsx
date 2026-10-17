/**
 * The page's name, in the document title and for a screen reader when the
 * page changes (A11Y-13). It used to stay «Polo» everywhere, and a tap on a
 * tab changed the page with nothing said.
 *
 * On a change of page (never the first one):
 * - focus that survived it (a tab of the bar, a Comité section) stays where it
 *   is, and the new page's name is said in a polite region;
 * - focus dropped with the old page (a link inside it) goes to the new page's
 *   h1, which says where the person is, so the name is not said twice. A page
 *   still loading its screen is given a moment; with no h1 by then, focus goes
 *   to the main region and the name is said.
 *
 * Mounted once, in the shell, as its own component: the boards changing never
 * render it, only a page or a name changing does.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { t } from '../i18n/es-MX'
import { useTournament } from '../data/tournamentStore'
import { focusLost, focusQuietly } from '../components/viewFocus'
import { routeTitle, usePageTitleOverride } from './pageTitle'

/** How long the new page's screen may take to show its h1 (a lazy screen loads first). */
export const HEADING_WAIT_MS = 600
/** How often it looks for it meanwhile. */
const HEADING_POLL_MS = 50
/** The region is emptied first and filled a moment later, so the same name said twice is heard twice. */
export const ANNOUNCE_DELAY_MS = 100

/** The new page's own heading: inside the main column, never one of a sheet. */
function pageHeading(): HTMLElement | null {
  for (const h of Array.from(document.querySelectorAll<HTMLElement>('main h1')))
    if (!h.closest('[role="dialog"]') && !h.closest('[inert]')) return h
  return null
}

export function RouteAnnouncer() {
  const { pathname } = useLocation()
  const route = routeTitle(pathname)
  // The tournament's name once its boards are the ones this address shows (another one's may still be in the store).
  const name = useTournament((s) => {
    const tour = s.data?.snapshot.tournament
    if (!tour || !route.slug) return null
    return route.slug.startsWith('_/')
      ? s.tournamentId?.startsWith('fixture:')
        ? tour.name
        : null
      : tour.slug === route.slug
        ? tour.name
        : null
  })
  const own = usePageTitleOverride()
  const page = own ?? (name ? t.titles.inTournament(route.page, name) : route.page)
  useEffect(() => {
    document.title = page === t.app.name ? t.app.name : t.titles.document(page)
  }, [page])

  const [said, setSaid] = useState('')
  const pageNow = useRef(page)
  pageNow.current = page
  // A new page: a new address, or a screen giving itself a name or taking it off (Entrar, then En vivo, at one address).
  const key = `${pathname}|${own === null ? '' : 'own'}`
  const seen = useRef(key)
  useEffect(() => {
    if (seen.current === key) return
    seen.current = key
    const lost = focusLost()
    setSaid('')
    let timer: ReturnType<typeof setTimeout>
    const started = performance.now()
    const say = () => {
      timer = setTimeout(() => setSaid(pageNow.current), ANNOUNCE_DELAY_MS)
    }
    const land = () => {
      // Focus found its own way meanwhile (a field that focuses itself, a sheet): leave it, and say the page.
      if (!focusLost()) {
        say()
        return
      }
      if (focusQuietly(pageHeading())) return
      if (performance.now() - started < HEADING_WAIT_MS) {
        timer = setTimeout(land, HEADING_POLL_MS)
        return
      }
      focusQuietly(document.querySelector('main'))
      say()
    }
    if (lost) land()
    else say()
    return () => clearTimeout(timer)
  }, [key])

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {said}
    </p>
  )
}

import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router'
import { OfflineBanner } from '../components/OfflineBanner'
import { MaintenanceBanner } from '../components/MaintenanceBanner'
import { UpdateBar } from '../components/UpdateBar'
import { Toaster } from '../components/ui'
import { useAuth } from '../data/auth'
import { startOutbox } from '../data/outbox'
import { useMyProfile } from '../data/profiles'
import { useAppFlags, usePlatform } from '../data/platform'
import { LateSignOutHome } from './LateSignOut'
import { LegalUpdate } from './LegalUpdate'
import { RouteAnnouncer } from './RouteAnnouncer'
import { scrollKey } from './scrollKey'
import { listenForLaunches } from '../lib/launch'
import { isLinkPage } from '../lib/linkPage'
import styles from './AppShell.module.css'

export function AppShell() {
  const init = useAuth((s) => s.init)
  // The Comité, the TV, the ceremony and the printable cards get a wider column; every player screen stays phone-width.
  const path = useLocation().pathname
  const wide = /\/(admin|tv|ceremonia|imprimir)(\/|$)/.test(path)
  // The Admin de Polo panel puts a list and its detail side by side on a laptop.
  const platform = /^\/admin(\/|$)/.test(path)
  // VIS-19: from 900 px the organizer's screens and the wizard take two columns, and En vivo the board with the feed
  // beside it (a tournament's or a link's home, fixtures included); a phone keeps its one column.
  const roomy = /^\/organizer(\/(new|nuevo\/_))?\/?$/.test(path) || /^\/(t|v)\/(_[a-z]*\/)?[^/]+\/?$/.test(path)
  // The boards drawn for a room or for paper set their own measure; everywhere else a line stops at about 70 characters.
  const board = /\/(tv|ceremonia|imprimir)(\/|$)/.test(path)
  // A link to watch is nobody's phone (STRAT-05): no session read (so no profile, inbox or badge either) and no outbox,
  // whose IndexedDB is never opened there. The app's switches still load: a public read, which writes and records
  // nothing, and carries the maintenance banner and the build every page must update to, a TV left on all day too.
  const linkPage = isLinkPage(path)
  // Inside the tournament shell the tab bar already pads the safe area; the main column must not add its own.
  // A link to watch (`/v/<token>`, its fixtures `/v/_/<name>`) has the same tab bar, the TV aside (STRAT-05).
  const tabbed =
    (/^\/t\/[^/]+(\/(?!tv|ceremonia|imprimir|admin)[^/]*)?\/?$/.test(path) &&
      !/\/(tv|ceremonia|imprimir|admin)(\/|$)/.test(path)) ||
    (linkPage && !/\/tv\/?$/.test(path))
  useEffect(() => {
    void useAppFlags.getState().load()
  }, [])
  useEffect(() => {
    if (linkPage) return
    void init()
    void startOutbox()
  }, [init, linkPage])
  // A shortcut or a link while the app is open focuses it (`focus-existing`, PWA-14): go where it says, in place.
  const navigate = useNavigate()
  useEffect(() => listenForLaunches((to) => void navigate(to)), [navigate])
  // An account has a profile (created on first load); it follows the session.
  const accountId = useAuth((s) => (s.user && !s.isAnonymous ? s.user.id : null))
  useEffect(() => {
    if (accountId) {
      void useMyProfile.getState().load()
      void usePlatform.getState().load()
    } else {
      useMyProfile.getState().clear()
      usePlatform.getState().clear()
    }
  }, [accountId])
  return (
    <div className={styles.shell}>
      <OfflineBanner />
      <MaintenanceBanner />
      <UpdateBar />
      <LateSignOutHome />
      <main
        className={`${styles.main} ${wide ? styles.mainWide : ''} ${platform ? styles.mainPlatform : ''} ${roomy ? styles.mainRoomy : ''} ${board ? '' : styles.mainProse} ${tabbed ? styles.mainTabbed : ''}`}
      >
        <Outlet />
      </main>
      <LegalUpdate />
      <Toaster />
      <RouteAnnouncer />
      {/* Each tab and Comité section keeps its own scroll; any other page its history entry's (MOT-16). */}
      <ScrollRestoration getKey={scrollKey} />
    </div>
  )
}

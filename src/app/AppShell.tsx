import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { OfflineBanner } from '../components/OfflineBanner'
import { Toaster } from '../components/ui'
import { useAuth } from '../data/auth'
import { startOutbox } from '../data/outbox'
import { useMyProfile } from '../data/profiles'
import { usePlatform } from '../data/platform'
import styles from './AppShell.module.css'

export function AppShell() {
  const init = useAuth((s) => s.init)
  // The Comité, the TV, the ceremony and the printable cards get a wider column; every player screen stays phone-width.
  const path = useLocation().pathname
  const wide = /\/(admin|tv|ceremonia|imprimir)(\/|$)/.test(path)
  // The Admin de Polo panel puts a list and its detail side by side on a laptop.
  const platform = /^\/admin(\/|$)/.test(path)
  // Inside the tournament shell the tab bar already pads the safe area; the main column must not add its own.
  const tabbed = /^\/t\/[^/]+(\/(?!tv|ceremonia|imprimir|admin)[^/]*)?\/?$/.test(path) && !/\/(tv|ceremonia|imprimir|admin)(\/|$)/.test(path)
  useEffect(() => {
    void init()
    void startOutbox()
  }, [init])
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
      <main className={`${styles.main} ${wide ? styles.mainWide : ''} ${platform ? styles.mainPlatform : ''} ${tabbed ? styles.mainTabbed : ''}`}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}

import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { OfflineBanner } from '../components/OfflineBanner'
import { Toaster } from '../components/ui'
import { useAuth } from '../data/auth'
import { startOutbox } from '../data/outbox'
import styles from './AppShell.module.css'

export function AppShell() {
  const init = useAuth((s) => s.init)
  // The Comité gets a wider column on a laptop; every player screen stays phone-width.
  const wide = /\/admin(\/|$)/.test(useLocation().pathname)
  useEffect(() => {
    void init()
    void startOutbox()
  }, [init])
  return (
    <div className={styles.shell}>
      <OfflineBanner />
      <main className={`${styles.main} ${wide ? styles.mainWide : ''}`}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}

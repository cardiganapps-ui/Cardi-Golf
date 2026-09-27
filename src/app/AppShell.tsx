import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { OfflineBanner } from '../components/OfflineBanner'
import { Toaster } from '../components/ui'
import { useAuth } from '../data/auth'
import { startOutbox } from '../data/outbox'
import styles from './AppShell.module.css'

export function AppShell() {
  const init = useAuth((s) => s.init)
  useEffect(() => {
    void init()
    void startOutbox()
  }, [init])
  return (
    <div className={styles.shell}>
      <OfflineBanner />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}

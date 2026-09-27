import { Outlet } from 'react-router'
import { OfflineBanner } from '../components/OfflineBanner'
import styles from './AppShell.module.css'

export function AppShell() {
  return (
    <div className={styles.shell}>
      <OfflineBanner />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

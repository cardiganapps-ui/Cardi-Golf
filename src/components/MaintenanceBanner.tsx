/**
 * The Admin de Polo's maintenance note (Admin › Salud), shown to everyone at
 * the top of every screen while it is set. Loaded once; if it cannot load,
 * there is simply no banner.
 */
import { useAppFlags } from '../data/platform'
import styles from './OfflineBanner.module.css'

export function MaintenanceBanner() {
  const text = useAppFlags((s) => s.flags?.maintenanceBanner ?? null)
  if (!text) return null
  return (
    <div className={`${styles.banner} ${styles.maintenance}`} role="status">
      {text}
    </div>
  )
}

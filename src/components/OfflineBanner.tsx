import { useSyncExternalStore } from 'react'
import { t } from '../i18n/es-MX'
import { ownsStatus, subscribeOwnStatus, useOnline } from './online'
import styles from './OfflineBanner.module.css'

/**
 * The region is always there and the banner comes and goes inside it (A11Y-14): a status region inserted
 * together with its text is one VoiceOver often skips. Empty, it takes no room.
 */
export function OfflineBanner() {
  const online = useOnline()
  const owned = useSyncExternalStore(subscribeOwnStatus, ownsStatus, ownsStatus)
  return <div role="status">{!online && !owned && <div className={styles.banner}>{t.sync.offline}</div>}</div>
}

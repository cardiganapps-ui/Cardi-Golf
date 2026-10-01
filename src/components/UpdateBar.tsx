/**
 * The update offer (PWA-03), at the top of every screen and never over
 * «Guardar hoyo» (PWA-01). It stays until the update is applied. A plain
 * new version waits while the Tarjeta has a half-entered hole; a required
 * one (this build is below `app_flags.minBuild`) always shows, because
 * nothing this phone saves goes out until it updates.
 */
import { useState } from 'react'
import { applyUpdate, useAppUpdate } from '../data/appUpdate'
import { useOutbox } from '../data/outbox'
import { t } from '../i18n/es-MX'
import styles from './OfflineBanner.module.css'

export function UpdateBar() {
  const waiting = useAppUpdate((s) => s.waiting)
  const required = useAppUpdate((s) => s.required)
  const editing = useOutbox((s) => s.editing)
  const [busy, setBusy] = useState(false)
  if (!required && (!waiting || editing)) return null
  return (
    <div className={`${styles.banner} ${styles.update} ${required ? styles.maintenance : ''}`} role="status">
      <span>{required ? t.sync.updateRequired : t.sync.newVersion}</span>
      <button
        type="button"
        className={styles.bannerAction}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void applyUpdate().finally(() => setBusy(false))
        }}
      >
        {t.sync.update}
      </button>
    </div>
  )
}

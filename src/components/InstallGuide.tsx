import { useState } from 'react'
import { t } from '../i18n/es-MX'
import styles from './InstallGuide.module.css'

const KEY = 'cardi-golf:install-guide-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

/** "Agrégala a tu pantalla de inicio" (§9.1). Hidden once installed or dismissed. */
export function InstallGuide() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed || isStandalone()) return null

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode: fine, just hide for this session */
    }
    setDismissed(true)
  }

  return (
    <section className={`card ${styles.guide}`}>
      <h2>{t.install.title}</h2>
      <p className="muted">{t.install.why}</p>
      <ol className={styles.steps}>
        <li>{t.install.ios}</li>
        <li>{t.install.android}</li>
      </ol>
      <button className="btn btn--ghost" type="button" onClick={dismiss}>
        {t.install.done}
      </button>
    </section>
  )
}

import { t } from '../i18n/es-MX'
import styles from './Wordmark.module.css'

/** The platform's own mark: a simple text wordmark (§14). Tournaments bring their own logo. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`${styles.mark} ${styles[size]}`} aria-label={t.app.name}>
      <img src="/favicon.svg" alt="" className={styles.icon} />
      <span className={styles.text}>{t.app.name}</span>
    </span>
  )
}

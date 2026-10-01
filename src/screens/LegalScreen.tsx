/**
 * `/privacidad` and `/terminos`: public, no session needed. Google's OAuth
 * consent screen links to both, and the home page is the app itself.
 *
 * Opened from a consent line (`?desde=formulario`), the page is a tab of its
 * own beside a half-filled form, so it offers to close that tab instead of
 * loading a second Polo. The other document then opens in place of this one:
 * a browser lets a page close its tab only while nothing is behind it.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import { FROM_FORM } from '../components/LegalLinks'
import styles from './profile/Profile.module.css'

const L = t.legal

/** How long a tab is given to close before the page says how to get back to the form. */
const CLOSE_WAIT_MS = 600

export function LegalScreen({ doc }: { doc: 'privacy' | 'terms' }) {
  const page = L[doc]
  const fromForm = useSearchParams()[0].get('desde') === FROM_FORM
  const [closeBlocked, setCloseBlocked] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function closeTab() {
    window.close()
    // Still here: this browser keeps the tab open.
    timer.current = window.setTimeout(() => setCloseBlocked(true), CLOSE_WAIT_MS)
  }

  const other = doc === 'privacy' ? '/terminos' : '/privacidad'
  return (
    <div className={`${styles.screen} ${styles.legal}`}>
      {fromForm ? (
        <span className={styles.brand}>
          <Wordmark />
        </span>
      ) : (
        <Link to="/" className={styles.brand} aria-label={L.back}>
          <Wordmark />
        </Link>
      )}
      <div className={styles.head}>
        <h1>{page.title}</h1>
        <p className={styles.help}>{page.updated}</p>
      </div>
      {page.sections.map(([heading, body]) => (
        <section key={heading} className={styles.section}>
          <h2 className={styles.legalHead}>{heading}</h2>
          <p className={styles.bio}>{body}</p>
        </section>
      ))}
      <p className={styles.help}>{L.contact}</p>
      <div className={styles.quiet}>
        <Link className="btn btn--ghost btn--sm" to={fromForm ? `${other}?desde=${FROM_FORM}` : other} replace={fromForm}>
          {doc === 'privacy' ? L.terms.title : L.privacy.title}
        </Link>
        {fromForm ? (
          <button className="btn btn--ghost btn--sm" type="button" onClick={closeTab}>
            {L.close}
          </button>
        ) : (
          <Link className="btn btn--ghost btn--sm" to="/">
            {L.back}
          </Link>
        )}
      </div>
      {fromForm && (
        <p className={styles.help} role="status">
          {closeBlocked ? L.closeBlocked : ''}
        </p>
      )}
    </div>
  )
}

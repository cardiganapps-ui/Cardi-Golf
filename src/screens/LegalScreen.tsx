/**
 * `/privacidad` and `/terminos`: public, no session needed. Google's OAuth
 * consent screen links to both, and the home page is the app itself.
 */
import { Link } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import styles from './profile/Profile.module.css'

const L = t.legal

export function LegalScreen({ doc }: { doc: 'privacy' | 'terms' }) {
  const page = L[doc]
  return (
    <div className={`${styles.screen} ${styles.legal}`}>
      <Link to="/" className={styles.brand} aria-label={L.back}>
        <Wordmark />
      </Link>
      <div className={styles.head}>
        <h1>{page.title}</h1>
        <p className={styles.help}>{L.updated}</p>
      </div>
      {page.sections.map(([heading, body]) => (
        <section key={heading} className={styles.section}>
          <h2 className={styles.legalHead}>{heading}</h2>
          <p className={styles.bio}>{body}</p>
        </section>
      ))}
      <p className={styles.help}>{L.contact}</p>
      <div className={styles.quiet}>
        <Link className="btn btn--ghost btn--sm" to={doc === 'privacy' ? '/terminos' : '/privacidad'}>
          {doc === 'privacy' ? L.terms.title : L.privacy.title}
        </Link>
        <Link className="btn btn--ghost btn--sm" to="/">
          {L.back}
        </Link>
      </div>
    </div>
  )
}

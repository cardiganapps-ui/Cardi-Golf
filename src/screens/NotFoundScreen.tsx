import { Link } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'

export function NotFoundScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 32 }}>
      <Wordmark />
      <h1>404</h1>
      <p className="muted">{t.errors.notFound}</p>
      <Link className="btn btn--secondary" to="/">
        {t.errors.backHome}
      </Link>
    </div>
  )
}

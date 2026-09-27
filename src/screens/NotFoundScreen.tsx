import { Link } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import { EmptyState } from '../components/primitives'

export function NotFoundScreen() {
  return (
    <div className="screen">
      <Wordmark />
      <EmptyState
        title={t.errors.notFound}
        body={t.errors.notFoundHint}
        action={
          <Link className="btn btn--secondary" to="/">
            {t.errors.backHome}
          </Link>
        }
      />
    </div>
  )
}

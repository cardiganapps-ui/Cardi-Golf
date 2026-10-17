import { Link } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import { EmptyState } from '../components/primitives'
import { usePageTitle } from '../app/pageTitle'
import { buttonClass } from '../components/buttonClass'

export function NotFoundScreen() {
  usePageTitle(t.titles.notFound)
  return (
    <div className="screen">
      <Wordmark />
      <EmptyState
        title={t.errors.notFound}
        body={t.errors.notFoundHint}
        action={
          <Link className={buttonClass({ variant: 'secondary' })} to="/">
            {t.errors.backHome}
          </Link>
        }
      />
    </div>
  )
}

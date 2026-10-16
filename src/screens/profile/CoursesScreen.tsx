/**
 * `/campos`: the course library outside any tournament, so a Ronda rápida
 * can add its course (database search, scorecard photo, or by hand) and come
 * back. Same editor as Comité › Campos.
 */
import { Link, useSearchParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Spinner } from '../../components/ui'
import { Lazy } from '../../components/Lazy'
import { AdminCourses } from '../../app/screens'
import { IconChevronLeft } from '../../components/icons'
import { safeNext } from '../../data/account'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'

export function CoursesScreen() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const ok = useRequireAccount(`/campos${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`)
  if (!ok) return <Spinner />
  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to={next} className={styles.iconBtn} aria-label={t.courses.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{t.courses.title}</h1>
        <span className={styles.iconSpacer} />
      </div>
      <Lazy>
        <AdminCourses />
      </Lazy>
    </div>
  )
}

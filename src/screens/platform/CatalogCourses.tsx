/**
 * Campos: the course catalog every tournament shares. Anyone with an
 * account can add a course, so this is where duplicates and badly typed
 * cards get found and fixed: filter by Duplicados / Con errores / Sin usar.
 */
import { useCallback, useState } from 'react'
import { Link, Outlet, useOutlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { Input } from '../../components/primitives'
import { usePlatformApi, type CourseFilter, type CourseRow } from '../../data/platform'
import type { TournamentsOutlet } from './TournamentsScreen'
import { usePaged } from './usePaged'
import s from './Platform.module.css'

const C = t.platform.courses
const FILTERS: CourseFilter[] = ['all', 'dupes', 'broken', 'unused']

export function CatalogCourses() {
  const api = usePlatformApi()
  const outlet = useOutlet()
  const { id: openId } = useParams()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<CourseFilter>('all')
  const fetch = useCallback((offset: number) => api.courses({ q, filter, limit: 50, offset }), [api, q, filter])
  const { rows, total, error, loadingMore, reload, more } = usePaged(fetch, !!q)

  return (
    <div className={`${s.split} ${outlet ? s.hasDetail : ''}`}>
      <div className={s.listPane}>
        <h2>{t.platform.sections.courses}</h2>
        <Input type="search" value={q} placeholder={C.search} aria-label={C.search} onChange={(e) => setQ(e.target.value)} />
        <div className={s.filters} role="group" aria-label={C.filterLabel}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={s.filter} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {C.filters[f]}
            </button>
          ))}
        </div>
        {error ? (
          <ErrorBox message={error} onRetry={() => void reload()} />
        ) : !rows ? (
          <Spinner rows={5} />
        ) : rows.length === 0 ? (
          <p className={s.help}>{C.empty}</p>
        ) : (
          <>
            <span className={s.help}>{C.count(rows.length, total)}</span>
            <div className={s.rows}>
              {rows.map((r) => (
                <CourseLine key={r.id} r={r} active={r.id === openId} />
              ))}
            </div>
            {rows.length < total && (
              <button className="btn btn--secondary" type="button" disabled={loadingMore} onClick={() => void more()}>
                {t.platform.more}
              </button>
            )}
          </>
        )}
      </div>
      <div className={s.detailPane}>
        {outlet ? <Outlet context={{ onChanged: () => void reload() } satisfies TournamentsOutlet} /> : <p className={s.placeholder}>{C.pickOne}</p>}
      </div>
    </div>
  )
}

function CourseLine({ r, active }: { r: CourseRow; active: boolean }) {
  return (
    <Link className={`${s.row} ${active ? s.rowActive : ''}`} to={r.id} aria-current={active ? 'page' : undefined}>
      <span className={s.rowText}>
        <span className={s.rowTitle}>{r.name}</span>
        <span className={s.rowSub}>{C.rowSub(r.tees, r.rounds, r.location)}</span>
      </span>
      <span className={s.rowEnd}>
        <span className={s.chips}>
          {r.dupes > 0 && <span className="chip chip--sun">{C.chips.dupe}</span>}
          {r.broken && <span className="chip chip--coral">{C.chips.broken}</span>}
        </span>
      </span>
    </Link>
  )
}

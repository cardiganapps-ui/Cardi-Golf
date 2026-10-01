/**
 * Personas: every account and every phone that signed in without one.
 * Search by email, handle or name (a phone: the player it claimed). The
 * detail is a child route, beside the list on a laptop.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useOutlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, ErrorBox, Spinner } from '../../components/ui'
import { Input } from '../../components/primitives'
import { usePlatformApi, type PeopleFilter, type PersonRow } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import type { TournamentsOutlet } from './TournamentsScreen'
import { personName } from './names'
import s from './Platform.module.css'
import { humanError } from '../../lib/humanError'

const P = t.platform
const H = P.people
const PAGE = 50
const FILTERS: PeopleFilter[] = ['all', 'accounts', 'devices', 'blocked']

export function PeopleScreen() {
  const api = usePlatformApi()
  const outlet = useOutlet()
  const { id: openId } = useParams()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<PeopleFilter>('all')
  const [rows, setRows] = useState<PersonRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seq = useRef(0)

  const load = useCallback(
    async (offset = 0) => {
      const mine = ++seq.current
      setError(null)
      try {
        const res = await api.people({ q, filter, limit: PAGE, offset })
        if (mine !== seq.current) return
        setTotal(res.total)
        setRows((prev) => (offset === 0 ? res.rows : [...(prev ?? []), ...res.rows]))
      } catch (e) {
        if (mine === seq.current) setError(humanError(e))
      }
    },
    [api, q, filter],
  )
  useEffect(() => {
    const id = window.setTimeout(() => void load(0), q ? 250 : 0)
    return () => window.clearTimeout(id)
  }, [load, q])

  return (
    <div className={`${s.split} ${outlet ? s.hasDetail : ''}`}>
      <div className={s.listPane}>
        <h2>{P.sections.people}</h2>
        <Input type="search" value={q} placeholder={H.search} aria-label={H.search} onChange={(e) => setQ(e.target.value)} />
        <div className={s.filters} role="group" aria-label={H.filterLabel}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={s.filter} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {H.filters[f]}
            </button>
          ))}
        </div>
        {error ? (
          <ErrorBox error={error} onRetry={() => void load(0)} />
        ) : !rows ? (
          <Spinner rows={5} />
        ) : rows.length === 0 ? (
          <p className={s.help}>{H.empty}</p>
        ) : (
          <>
            <span className={s.help}>{H.count(rows.length, total)}</span>
            <div className={s.rows}>
              {rows.map((r) => (
                <PersonLine key={r.id} r={r} active={r.id === openId} />
              ))}
            </div>
            {rows.length < total && (
              <button
                className="btn btn--secondary"
                type="button"
                disabled={loadingMore}
                onClick={async () => {
                  setLoadingMore(true)
                  await load(rows.length)
                  setLoadingMore(false)
                }}
              >
                {P.more}
              </button>
            )}
          </>
        )}
      </div>
      <div className={s.detailPane}>
        {outlet ? <Outlet context={{ onChanged: () => void load(0) } satisfies TournamentsOutlet} /> : <p className={s.placeholder}>{H.pickOne}</p>}
      </div>
    </div>
  )
}

function PersonLine({ r, active }: { r: PersonRow; active: boolean }) {
  const who = r.anonymous
    ? r.devicePlayer
      ? H.phoneAs(r.devicePlayer, r.deviceTournament)
      : H.phoneUnclaimed
    : [r.handle ? `@${r.handle}` : null, r.displayName ? r.email : null].filter(Boolean).join(' · ') || (H.provider[r.provider] ?? r.provider)
  return (
    <Link className={`${s.row} ${active ? s.rowActive : ''}`} to={r.id} aria-current={active ? 'page' : undefined}>
      <Avatar name={personName(r)} url={r.avatarUrl} size="sm" />
      <span className={s.rowText}>
        <span className={s.rowTitle}>{r.anonymous ? H.phone : personName(r)}</span>
        <span className={s.rowSub}>{H.rowSub(who, r.tournaments)}</span>
      </span>
      <span className={s.rowEnd}>
        <span className={s.chips}>
          {r.blocked && <span className="chip chip--coral">{H.chips.blocked}</span>}
          {r.isAdmin && <span className="chip chip--teal">{H.chips.admin}</span>}
        </span>
        <span>{relTime(r.lastSignInAt ?? r.createdAt)}</span>
      </span>
    </Link>
  )
}

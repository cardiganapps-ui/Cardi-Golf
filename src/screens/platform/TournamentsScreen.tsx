/**
 * Torneos: every tournament on Polo, searchable by name, code or the
 * organizer's email, filtered by kind. The detail is a child route: beside
 * the list on a laptop, in its place on a phone.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useOutlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { Input } from '../../components/primitives'
import { usePlatformApi, type PlatformTournamentRow, type TournamentKind } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import s from './Platform.module.css'

const P = t.platform
const PAGE = 50
const KINDS: Array<TournamentKind | 'all'> = ['all', 'real', 'quick', 'crew', 'practice', 'protected', 'orphan']

/** What the detail pane tells the list: something changed, reload. */
export interface TournamentsOutlet {
  onChanged(): void
}

export function TournamentsScreen() {
  const api = usePlatformApi()
  const outlet = useOutlet()
  const { id: openId } = useParams()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<TournamentKind | 'all'>('all')
  const [rows, setRows] = useState<PlatformTournamentRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seq = useRef(0)

  const load = useCallback(
    async (offset = 0) => {
      const mine = ++seq.current
      setError(null)
      try {
        const res = await api.tournaments({ q, kind: kind === 'all' ? null : kind, limit: PAGE, offset })
        if (mine !== seq.current) return
        setTotal(res.total)
        setRows((prev) => (offset === 0 ? res.rows : [...(prev ?? []), ...res.rows]))
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api, q, kind],
  )

  // Typing waits a beat before asking; changing the filter asks at once.
  useEffect(() => {
    const id = window.setTimeout(() => void load(0), q ? 250 : 0)
    return () => window.clearTimeout(id)
  }, [load, q])

  async function more() {
    setLoadingMore(true)
    await load(rows?.length ?? 0)
    setLoadingMore(false)
  }

  return (
    <div className={`${s.split} ${outlet ? s.hasDetail : ''}`}>
      <div className={s.listPane}>
        <h2>{P.sections.tournaments}</h2>
        <Input type="search" value={q} placeholder={P.search} aria-label={P.search} onChange={(e) => setQ(e.target.value)} />
        <div className={s.filters} role="group" aria-label={P.kindLabel}>
          {KINDS.map((k) => (
            <button key={k} type="button" className={s.filter} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {P.kinds[k]}
            </button>
          ))}
        </div>
        {error ? (
          <ErrorBox message={error} onRetry={() => void load(0)} />
        ) : !rows ? (
          <Spinner rows={5} />
        ) : rows.length === 0 ? (
          <p className={s.help}>{P.empty}</p>
        ) : (
          <>
            <span className={s.help}>{P.count(rows.length, total)}</span>
            <div className={s.rows}>
              {rows.map((r) => (
                <TournamentRow key={r.id} r={r} active={r.id === openId} />
              ))}
            </div>
            {rows.length < total && (
              <button className="btn btn--secondary" type="button" disabled={loadingMore} onClick={() => void more()}>
                {P.more}
              </button>
            )}
          </>
        )}
      </div>
      <div className={s.detailPane}>
        {outlet ? <Outlet context={{ onChanged: () => void load(0) } satisfies TournamentsOutlet} /> : <p className={s.placeholder}>{P.pickOne}</p>}
      </div>
    </div>
  )
}

function TournamentRow({ r, active }: { r: PlatformTournamentRow; active: boolean }) {
  return (
    <Link className={`${s.row} ${active ? s.rowActive : ''}`} to={r.id} aria-current={active ? 'page' : undefined}>
      <span className={s.rowText}>
        <span className={s.rowTitle}>{r.name}</span>
        <span className={s.rowSub}>{P.rowSub(r.players, r.ownerName)}</span>
      </span>
      <span className={s.rowEnd}>
        <TournamentChips r={r} />
        <span>{r.lastActivityAt ? relTime(r.lastActivityAt) : P.noActivity}</span>
      </span>
    </Link>
  )
}

/** Status and the flags that change what the admin may do. */
export function TournamentChips({ r }: { r: Pick<PlatformTournamentRow, 'status' | 'protected' | 'practice' | 'quick'> & { organizers?: number } }) {
  return (
    <span className={s.chips}>
      {r.protected && <span className="chip chip--coral">{P.chips.protected}</span>}
      {r.organizers === 0 && <span className="chip chip--sun">{P.chips.orphan}</span>}
      {r.practice && <span className="chip chip--outline">{P.chips.practice}</span>}
      {r.status === 'live' && <span className="chip chip--teal">{P.status.live}</span>}
    </span>
  )
}

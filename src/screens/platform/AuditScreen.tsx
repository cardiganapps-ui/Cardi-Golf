/**
 * Auditoría: everything the Admin de Polo did, in one feed — the panel's
 * actions and his changes inside tournaments as their Comité — newest
 * first, searchable, each one openable in full.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner } from '../../components/ui'
import { Input, Segmented } from '../../components/primitives'
import { usePlatformApi, type AuditDetail, type AuditItem } from '../../data/platform'
import { changedFields, showValue } from '../../lib/auditDiff'
import { relTime } from '../../lib/relTime'
import s from './Platform.module.css'

const A = t.platform.auditLog
const PAGE = 50
type Source = 'all' | 'platform' | 'comite'

const titleOf = (x: Pick<AuditItem, 'source' | 'action' | 'table'>) =>
  x.source === 'platform' ? (A.actions[x.action] ?? x.action) : A.comiteLine(t.platform.tables[x.table ?? ''] ?? x.table ?? '', x.action)

export function AuditScreen() {
  const api = usePlatformApi()
  const [source, setSource] = useState<Source>('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AuditItem[] | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<AuditItem | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seq = useRef(0)

  const load = useCallback(
    async (before: string | null) => {
      const mine = ++seq.current
      setError(null)
      try {
        const page = await api.audit({ source, before, q, limit: PAGE })
        if (mine !== seq.current) return
        setRows((prev) => (before ? [...(prev ?? []), ...page] : page))
        setDone(page.length < PAGE)
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e))
      }
    },
    [api, source, q],
  )
  useEffect(() => {
    const id = window.setTimeout(() => void load(null), q ? 250 : 0)
    return () => window.clearTimeout(id)
  }, [load, q])

  return (
    <div className={s.screen}>
      <h2>{t.platform.sections.audit}</h2>
      <p className={s.help}>{A.hint}</p>
      <Segmented value={source} label={A.sourceLabel} options={(['all', 'platform', 'comite'] as const).map((v) => ({ value: v, label: A.sources[v] }))} onChange={setSource} />
      <Input type="search" value={q} placeholder={A.search} aria-label={A.search} onChange={(e) => setQ(e.target.value)} />
      {error ? (
        <ErrorBox message={error} onRetry={() => void load(null)} />
      ) : !rows ? (
        <Spinner rows={6} />
      ) : rows.length === 0 ? (
        <p className={s.help}>{A.empty}</p>
      ) : (
        <>
          <div className={s.rows}>
            {rows.map((x) => (
              <button key={`${x.source}-${x.id}`} type="button" className={`${s.row} ${s.rowPick}`} onClick={() => setOpen(x)}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{titleOf(x)}</span>
                  <span className={s.rowSub}>{[x.tournament, x.reason, x.source === 'platform' && !x.tournament ? x.detail : null].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                <span className={s.rowEnd}>
                  {x.source === 'comite' && <span className="chip chip--outline">{A.sources.comite}</span>}
                  {relTime(x.at)}
                </span>
              </button>
            ))}
          </div>
          {!done && (
            <button
              className="btn btn--secondary"
              type="button"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true)
                await load(rows[rows.length - 1]!.at)
                setLoadingMore(false)
              }}
            >
              {A.more}
            </button>
          )}
        </>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={A.detail}>
        {open && <AuditEntry item={open} />}
      </Sheet>
    </div>
  )
}

function AuditEntry({ item }: { item: AuditItem }) {
  const api = usePlatformApi()
  const [d, setD] = useState<AuditDetail | null | undefined>(undefined)
  useEffect(() => {
    api.auditEntry(item.source, item.id).then(setD, () => setD(null))
  }, [api, item])
  const fields: Array<{ key: string; value: string }> = !d
    ? []
    : d.source === 'platform'
      ? Object.entries(d.payload ?? {}).map(([key, v]) => ({ key, value: showValue(v) }))
      : changedFields({ action: d.action as 'INSERT' | 'UPDATE' | 'DELETE', before: d.before ?? null, after: d.after ?? null }).map((f) => ({
          key: f.key,
          value: d.action === 'UPDATE' ? `${showValue(f.before)} → ${showValue(f.after)}` : showValue(d.action === 'INSERT' ? f.after : f.before),
        }))
  return (
    <div className={s.section}>
      <strong>{titleOf(item)}</strong>
      <span className={s.help}>{[item.actor, new Date(item.at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')}</span>
      {item.reason && <span className={s.help}>{t.admin.history.reason(item.reason)}</span>}
      {item.tournamentId && (
        <Link className="btn btn--secondary btn--sm" to={`../torneos/${item.tournamentId}`} relative="path">
          {item.tournament ?? t.platform.open}
        </Link>
      )}
      {d === undefined ? (
        <Spinner rows={3} />
      ) : fields.length > 0 ? (
        <>
          <span className="label">{A.fields}</span>
          <div className={s.rows}>
            {fields.map((f) => (
              <div key={f.key} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{f.key}</span>
                  <span className={s.rowSub}>{f.value}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

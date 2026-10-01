/**
 * Historial: every change to this tournament, newest first — who, when,
 * what, and why when there was a why. What the Admin de Polo did is marked,
 * so an organizer is never surprised by a correction they did not make.
 * Tap a line for the fields that changed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner, Toggle } from '../../components/ui'
import { tournamentAudit, type AuditEntry } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { relTime } from '../../lib/relTime'
import { changedFields, showValue as show } from '../../lib/auditDiff'
import { useTournamentCtx } from '../tournament/TournamentGate'
import a from './Admin.module.css'
import { humanError } from '../../lib/humanError'

const H = t.admin.history
const PAGE = 50
export function AdminHistory() {
  const { tournamentId } = useTournamentCtx()
  const players = useTournament((s) => s.data?.snapshot.players)
  const rounds = useTournament((s) => s.data?.snapshot.rounds)
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [platformOnly, setPlatformOnly] = useState(false)
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(
    async (before?: number) => {
      setError(null)
      try {
        const page = await tournamentAudit(tournamentId, before, PAGE)
        setEntries((prev) => (before ? [...(prev ?? []), ...page] : page))
        setDone(page.length < PAGE)
      } catch (e) {
        setError(humanError(e))
      }
    },
    [tournamentId],
  )
  useEffect(() => {
    void load()
  }, [load])

  const name = useMemo(() => {
    const m = new Map((players ?? []).map((p) => [p.id, p.displayName]))
    return (id: unknown) => (typeof id === 'string' ? (m.get(id) ?? null) : null)
  }, [players])
  const roundNo = useMemo(() => {
    const m = new Map((rounds ?? []).map((r) => [r.id, r.number]))
    return (id: unknown) => (typeof id === 'string' ? (m.get(id) ?? null) : null)
  }, [rounds])

  /** One line that says what happened, in the tournament's own words. */
  function title(e: AuditEntry): string {
    const row = e.after ?? e.before ?? {}
    const verb = H.what[e.action] ?? e.action
    if (e.table === 'scores') {
      const player = name(row.player_id) ?? '?'
      const r = roundNo(row.round_id)
      const hole = `${row.hole ?? '?'}${r && (rounds?.length ?? 0) > 1 ? ` (día ${r})` : ''}`
      const before = e.action === 'INSERT' ? null : e.before?.picked_up ? 'levantó' : (e.before?.strokes as number | null) != null ? String(e.before?.strokes) : null
      const after = e.action === 'DELETE' ? null : e.after?.picked_up ? 'levantó' : (e.after?.strokes as number | null) != null ? String(e.after?.strokes) : null
      return H.scoreLine(player, hole, before, after)
    }
    const what = t.platform.tables[e.table] ?? e.table
    const who = e.table === 'players' ? (row.display_name as string | undefined) : e.table === 'rounds' ? `${row.number ?? ''}` : name(row.player_id)
    return `${what}${who ? ` ${who}` : ''}, ${verb}`
  }

  if (error) return <ErrorBox error={error} onRetry={() => void load()} />
  if (!entries) return <Spinner rows={6} />
  const shown = platformOnly ? entries.filter((e) => e.platform) : entries

  return (
    <div className={a.screen}>
      <h2>{t.admin.sections.history}</h2>
      <p className={a.help}>{H.hint}</p>
      <Toggle label={H.platformOnly} checked={platformOnly} onChange={setPlatformOnly} />
      {shown.length === 0 ? (
        <p className={a.help}>{H.empty}</p>
      ) : (
        <div className={a.rows}>
          {shown.map((e) => (
            <div key={e.id} className={a.row}>
              <button type="button" className={a.rowBtn} onClick={() => setOpen(e)}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{title(e)}</span>
                  <span className={a.rowSub}>
                    {[e.platform ? H.byPlatform : (e.actor ?? H.byComite), relTime(e.at), e.reason].filter(Boolean).join(', ')}
                  </span>
                </span>
                {e.platform && <span className="chip chip--coral">{H.byPlatform}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
      {!done && (
        <button
          className="btn btn--secondary"
          type="button"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true)
            await load(entries[entries.length - 1]?.id)
            setLoadingMore(false)
          }}
        >
          {H.more}
        </button>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={H.detail}>
        {open && (
          <div className={a.section}>
            <strong>{title(open)}</strong>
            <span className={a.help}>
              {[open.platform ? H.byPlatform : (open.actor ?? H.byComite), new Date(open.at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })].join(', ')}
            </span>
            {open.reason && <span className={a.help}>{H.reason(open.reason)}</span>}
            <span className="label">{H.fields}</span>
            <div className={a.rows}>
              {changedFields(open).map((f) => (
                <div key={f.key} className={a.row}>
                  <span className={a.rowText}>
                    <span className={a.rowTitle}>{f.key}</span>
                    <span className={a.rowSub}>
                      {open.action === 'UPDATE' ? H.change(show(f.before), show(f.after)) : show(open.action === 'INSERT' ? f.after : f.before)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

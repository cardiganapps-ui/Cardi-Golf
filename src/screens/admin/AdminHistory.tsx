/**
 * Historial: every change to this tournament, newest first — who, when,
 * what, and why when there was a why. What the Admin de Polo did is marked,
 * so an organizer is never surprised by a correction they did not make.
 * Tap a line for the fields that changed.
 *
 * TRUST-19: the history narrows to a player, a day, a hole, the Comité's
 * corrections or the Admin de Polo, on the server, so «Ver más» pages what
 * the filters leave (0063). A score's detail opens that hole's whole story.
 * The detail reads in Spanish, each id as the name it stands for.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner, Toggle } from '../../components/ui'
import { tournamentAudit, type AuditEntry, type AuditFilter } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { relTime } from '../../lib/relTime'
import { changedFields } from '../../lib/auditDiff'
import { auditNames, fieldLabel, fieldValue } from '../../lib/auditFields'
import { localWhen } from '../../lib/localWhen'
import { useTournamentCtx } from '../tournament/tournamentContext'
import a from './Admin.module.css'
import { humanError } from '../../lib/humanError'

const H = t.admin.history
const F = H.filter
const PAGE = 50

const any = (f: AuditFilter) => !!(f.player || f.round || f.hole || f.corrections || f.platform)

export function AdminHistory() {
  const { tournamentId } = useTournamentCtx()
  const snapshot = useTournament((s) => s.data?.snapshot)
  const players = snapshot?.players
  const rounds = snapshot?.rounds
  const timeZone = snapshot?.tournament.timezone ?? 'America/Mazatlan'
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AuditFilter>({})
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  /** The latest ask: an answer for filters since changed is dropped, never laid over the new list. */
  const asked = useRef(0)

  const load = useCallback(
    async (before?: number) => {
      const mine = ++asked.current
      setError(null)
      try {
        const page = await tournamentAudit(tournamentId, before, PAGE, filter)
        if (mine !== asked.current) return
        setEntries((prev) => (before ? [...(prev ?? []), ...page] : page))
        setDone(page.length < PAGE)
      } catch (e) {
        if (mine === asked.current) setError(humanError(e))
      }
    },
    [tournamentId, filter],
  )
  useEffect(() => {
    setEntries(null)
    void load()
  }, [load])

  const names = useMemo(() => auditNames(snapshot), [snapshot])
  const name = useCallback((id: unknown) => (typeof id === 'string' ? names.player(id) : null), [names])
  const roundNo = useMemo(() => {
    const m = new Map((rounds ?? []).map((r) => [r.id, r.number]))
    return (id: unknown) => (typeof id === 'string' ? (m.get(id) ?? null) : null)
  }, [rounds])
  const sortedPlayers = useMemo(() => [...(players ?? [])].sort((x, y) => x.displayName.localeCompare(y.displayName, 'es')), [players])
  const holeCount = Math.max(18, ...(rounds ?? []).map((r) => r.holes))
  const set = (patch: AuditFilter) => setFilter((f) => ({ ...f, ...patch }))

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
    // A phone took a player with his PIN, or stopped holding him (TRUST-24). Only the Comité's «Sacar» has a reason.
    if (e.table === 'pin_claims') {
      const player = name(row.player_id) ?? '?'
      if (e.action === 'INSERT') return H.claim.took(player, H.claim.from[String(row.platform)] ?? H.claim.from.other!)
      if (e.action === 'UPDATE' && e.before?.released_at == null && e.after?.released_at != null) return e.reason ? H.claim.removed(player) : H.claim.left(player)
    }
    // A PIN unlocked (0056), or set and changed (0064, DB-13): never the PIN itself.
    if (e.table === 'player_pins') {
      const player = name(row.player_id) ?? '?'
      return e.after?.locked === false ? H.claim.unlocked(player) : e.action === 'INSERT' ? H.claim.pinSet(player) : H.claim.pinChanged(player)
    }
    if (e.table === 'tournament_results') return H.results[e.action] ?? e.action
    // The link to watch (STRAT-05, 0053): made, given a new token, its money switched, or turned off. Its token is never in the history.
    if (e.table === 'spectator_links') {
      const L = t.spectator.history
      if (e.action === 'INSERT') return L.created(row.money === true)
      if (e.action === 'DELETE') return L.off
      if (e.before?.rotated_at !== e.after?.rotated_at) return L.rotated
      if (e.before?.money !== e.after?.money) return L.money(e.after?.money === true)
    }
    const what = t.platform.tables[e.table] ?? e.table
    const who = e.table === 'players' ? (row.display_name as string | undefined) : e.table === 'rounds' ? `${row.number ?? ''}` : name(row.player_id)
    return `${what}${who ? ` ${who}` : ''}, ${verb}`
  }
  /** Who made it: once the player has entered on more than one phone, from which (TRUST-24). */
  function by(e: AuditEntry): string {
    if (e.platform) return H.byPlatform
    const actor = e.actor ?? H.byComite
    return e.phone ? `${actor}, ${H.phone(e.phone.n, e.phone.of, H.kinds[e.phone.kind] ?? null)}` : actor
  }
  /** A score's hole, to read its whole story: the player, the day and the hole of the row. */
  function holeOf(e: AuditEntry): AuditFilter | null {
    if (e.table !== 'scores') return null
    const row = e.after ?? e.before ?? {}
    const hole = typeof row.hole === 'number' ? row.hole : null
    return typeof row.player_id === 'string' && typeof row.round_id === 'string' && hole ? { player: row.player_id, round: row.round_id, hole } : null
  }

  const filtered = any(filter)
  return (
    <div className={a.screen}>
      <h2>{t.admin.sections.history}</h2>
      <p className={a.help}>{H.hint}</p>
      <div className={a.filters}>
        <label className="field">
          <span className="label">{F.player}</span>
          <select className="select" value={filter.player ?? ''} onChange={(e) => set({ player: e.target.value || undefined })}>
            <option value="">{F.all}</option>
            {sortedPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        {(rounds?.length ?? 0) > 1 && (
          <label className="field">
            <span className="label">{F.round}</span>
            <select className="select" value={filter.round ?? ''} onChange={(e) => set({ round: e.target.value || undefined })}>
              <option value="">{F.all}</option>
              {[...(rounds ?? [])]
                .sort((x, y) => x.number - y.number)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {t.round.day(r.number)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="label">{F.hole}</span>
          <select className="select" value={filter.hole ?? ''} onChange={(e) => set({ hole: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">{F.all}</option>
            {Array.from({ length: holeCount }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Toggle label={F.corrections} checked={!!filter.corrections} onChange={(v) => set({ corrections: v })} />
      <Toggle label={H.platformOnly} checked={!!filter.platform} onChange={(v) => set({ platform: v })} />
      {filtered && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFilter({})}>
          {F.clear}
        </button>
      )}

      {error ? (
        <ErrorBox error={error} onRetry={() => void load()} />
      ) : !entries ? (
        <Spinner rows={6} />
      ) : entries.length === 0 ? (
        <p className={a.help}>{filtered ? F.none : H.empty}</p>
      ) : (
        <div className={a.rows}>
          {entries.map((e) => (
            <div key={e.id} className={a.row}>
              <button type="button" className={a.rowBtn} onClick={() => setOpen(e)}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{title(e)}</span>
                  <span className={a.rowSub}>
                    {[by(e), relTime(e.at), e.reason].filter(Boolean).join(', ')}
                  </span>
                </span>
                {e.platform && <span className="chip chip--coral">{H.byPlatform}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
      {entries && !done && !error && (
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
            <span className={a.help}>{[by(open), localWhen(open.at, timeZone)].join(', ')}</span>
            {open.reason && <span className={a.help}>{H.reason(open.reason)}</span>}
            <span className="label">{H.fields}</span>
            <div className={a.rows}>
              {changedFields(open).map((f) => {
                const show = (v: unknown) => fieldValue(f.key, v, open.table, names, timeZone)
                return (
                  <div key={f.key} className={a.row}>
                    <span className={a.rowText}>
                      <span className={a.rowTitle}>{fieldLabel(f.key)}</span>
                      <span className={a.rowSub}>{open.action === 'UPDATE' ? H.change(show(f.before), show(f.after)) : show(open.action === 'INSERT' ? f.after : f.before)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
            {holeOf(open) && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setFilter(holeOf(open)!)
                  setOpen(null)
                }}
              >
                {F.holeStory}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

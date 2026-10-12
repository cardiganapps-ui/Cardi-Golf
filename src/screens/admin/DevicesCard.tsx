/**
 * Rondas › «Teléfonos del torneo» (STRAT-02): the phones of this tournament
 * seen in the last 7 days, from their heartbeats (0037). The one that still
 * has holes to send comes first, named by its player, so the Comité can go
 * find it before closing the day.
 */
import { useEffect } from 'react'
import { t } from '../../i18n/es-MX'
import { BUILD } from '../../lib/build'
import { relTime } from '../../lib/relTime'
import { loadTournamentDevices, useTournamentDevices, type TournamentDevice } from '../../data/tournamentDevices'
import a from './Admin.module.css'

const D = t.admin.devices

function order(items: TournamentDevice[]): TournamentDevice[] {
  return [...items].sort((x, y) => y.pending - x.pending || y.rejected - x.rejected || Date.parse(y.lastSeenAt) - Date.parse(x.lastSeenAt))
}

export function DevicesCard({ tournamentId }: { tournamentId: string }) {
  const s = useTournamentDevices()
  useEffect(() => {
    void loadTournamentDevices(tournamentId)
  }, [tournamentId])
  const mine = s.tournamentId === tournamentId
  const items = mine ? order(s.items) : []
  return (
    <section className={a.section} aria-labelledby="devices-title" aria-busy={s.status === 'loading'}>
      <div className={a.sectionTitle}>
        <strong id="devices-title">{D.title}</strong>
        <button className="btn btn--ghost btn--sm" type="button" disabled={s.status === 'loading'} onClick={() => void loadTournamentDevices(tournamentId)}>
          {D.refresh}
        </button>
      </div>
      <p className={a.help}>{D.hint}</p>
      {mine && s.status === 'unavailable' && <p className={a.help}>{D.unavailable}</p>}
      {mine && s.status === 'error' && <p className={a.error}>{D.failed}</p>}
      {mine && s.status === 'ready' && items.length === 0 && <p className={a.help}>{D.none}</p>}
      {items.length > 0 && (
        <div className={a.rows}>
          {items.map((d, i) => (
            <div key={`${d.playerId ?? 'none'}-${d.lastSeenAt}-${i}`} className={a.row}>
              <span className={a.rowText}>
                <span className={a.rowTitle}>{d.player ?? D.noPlayer}</span>
                <span className={d.pending > 0 ? a.warn : a.rowSub}>
                  {d.pending > 0 ? D.pending(d.pending, d.oldestPendingAt ? relTime(d.oldestPendingAt) : null) : D.clear}
                </span>
                {d.rejected > 0 && <span className={a.warn}>{D.rejected(d.rejected)}</span>}
                <span className={a.help}>{D.seen(relTime(d.lastSeenAt), d.buildSha, !!d.buildSha && d.buildSha !== BUILD.sha)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

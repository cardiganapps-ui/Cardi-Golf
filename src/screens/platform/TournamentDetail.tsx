/**
 * One tournament, as the platform admin sees it: who runs it, its rounds,
 * what's in it, the latest changes (the admin's own marked), and the one
 * control that is his to use here, Protegido. Everything else is the
 * tournament's own Comité, one tap away.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner, toast } from '../../components/ui'
import { IconChevronLeft, IconLock, IconShield } from '../../components/icons'
import { ReasonSheet } from '../../components/ReasonSheet'
import { usePlatformApi, type PlatformTournament } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import { TournamentChips, type TournamentsOutlet } from './TournamentsScreen'
import s from './Platform.module.css'

const P = t.platform
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export function TournamentDetail() {
  const { id = '' } = useParams()
  const api = usePlatformApi()
  const outlet = useOutletContext<TournamentsOutlet | undefined>()
  const [data, setData] = useState<PlatformTournament | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'unlock' | 'unprotect' | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.tournament(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, id])
  useEffect(() => {
    setData(undefined)
    void load()
  }, [load])

  const changed = async () => {
    await load()
    outlet?.onChanged()
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      await changed()
      toast(P.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link className={`btn btn--ghost btn--sm ${s.backLink}`} to=".." relative="path">
      <IconChevronLeft size={18} />
      {P.back}
    </Link>
  )
  if (error) return <>{back}<ErrorBox message={error} onRetry={() => void load()} /></>
  if (data === undefined) return <Spinner rows={6} />
  if (data === null) return <>{back}<p className={s.help}>{P.notFound}</p></>
  const d = data

  return (
    <div className={s.screen}>
      {back}
      <div className={s.detailHead}>
        <h2>{d.name}</h2>
        <TournamentChips r={{ ...d, organizers: d.organizers.length }} />
        <span className={s.help}>
          {P.status[d.status]} · {P.code} {d.joinCode} · {P.created(relTime(d.createdAt))}
          {d.crew ? ` · ${P.crew(d.crew.name)}` : ''}
        </span>
        <div className={s.actions}>
          <Link className="btn btn--primary btn--sm" to={`/t/${d.slug}`}>
            {P.open}
          </Link>
          <Link className="btn btn--secondary btn--sm" to={`/t/${d.slug}/admin`}>
            {P.openComite}
          </Link>
        </div>
      </div>

      <div className={`${s.protect} ${d.protected ? s.protectOn : ''}`}>
        <span className={s.protectHead}>
          {d.protected ? <IconLock size={18} /> : <IconShield size={18} />}
          {d.protected ? P.chips.protected : P.protection}
        </span>
        <span className={s.help}>{d.protected ? P.protectedBody : P.unprotectedBody}</span>
        {d.unlockedUntil && <span className={s.help}>{P.unlockedUntil(clock(d.unlockedUntil))}</span>}
        <div className={s.actions}>
          {!d.protected && (
            <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void run(() => api.setProtected(d.id, true))}>
              {P.protect}
            </button>
          )}
          {d.protected && !d.unlockedUntil && (
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => setSheet('unlock')}>
              {P.unlock}
            </button>
          )}
          {d.protected && d.unlockedUntil && (
            <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void run(() => api.relock(d.id))}>
              {P.relock}
            </button>
          )}
          {d.protected && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => setSheet('unprotect')}>
              {P.unprotect}
            </button>
          )}
        </div>
      </div>

      <div className={s.counts}>
        {(Object.keys(P.counts) as Array<keyof typeof P.counts>).map((k) => (
          <span key={k} className={s.count}>
            <span className={`${s.countValue} ${k === 'disputes' && d.counts[k] > 0 ? s.countHot : ''}`}>{d.counts[k]}</span>
            <span className={s.countLabel}>{P.counts[k]}</span>
          </span>
        ))}
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{P.comite}</strong>
        </div>
        {d.organizers.length === 0 ? (
          <p className={s.help}>{P.noComite}</p>
        ) : (
          <div className={s.rows}>
            {d.organizers.map((o) => (
              <div key={o.userId} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{o.name}</span>
                  <span className={s.rowSub}>{o.email}</span>
                </span>
                <span className={s.rowEnd}>{o.role === 'owner' ? P.roleOwner : P.roleAdmin}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{P.rounds}</strong>
        </div>
        {d.rounds.length === 0 ? (
          <p className={s.help}>{P.noRounds}</p>
        ) : (
          <div className={s.rows}>
            {d.rounds.map((r) => (
              <div key={r.id} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{P.roundLine(r.number, r.course, r.scores)}</span>
                  <span className={s.rowSub}>{r.date ?? '—'}</span>
                </span>
                <span className={s.rowEnd}>{P.roundStatus[r.status] ?? r.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{P.audit}</strong>
        </div>
        {d.audit.length === 0 ? (
          <p className={s.help}>{P.auditEmpty}</p>
        ) : (
          <div className={s.rows}>
            {d.audit.map((a) => (
              <div key={a.id} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{P.auditLine(P.tables[a.table] ?? a.table, a.action)}</span>
                  <span className={s.rowSub}>{[a.platform ? P.byPlatform : a.actor, a.reason].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                <span className={s.rowEnd}>
                  {a.platform && <span className="chip chip--coral">{P.byPlatform}</span>}
                  {relTime(a.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReasonSheet
        open={sheet === 'unlock'}
        title={P.unlockTitle}
        body={P.unlockBody}
        confirmLabel={P.unlock}
        onClose={() => setSheet(null)}
        onConfirm={async (reason) => {
          await api.unlock(d.id, reason)
          await changed()
        }}
      />
      <ReasonSheet
        open={sheet === 'unprotect'}
        title={P.unprotect}
        body={P.unprotectedBody}
        confirmLabel={P.unprotect}
        danger
        onClose={() => setSheet(null)}
        onConfirm={async (reason) => {
          await api.setProtected(d.id, false, reason)
          await changed()
        }}
      />
    </div>
  )
}

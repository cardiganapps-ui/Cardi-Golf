/**
 * One tournament, as the platform admin sees it: who runs it, its rounds,
 * what's in it, the latest changes (the admin's own marked), and the one
 * control that is his to use here, Protegido. Everything else is the
 * tournament's own Comité, one tap away.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Sheet, Spinner, toast } from '../../components/ui'
import { Field, Input } from '../../components/primitives'
import { IconChevronLeft, IconLock, IconShield } from '../../components/icons'
import { ReasonSheet } from '../../components/ReasonSheet'
import { usePlatformApi, type PersonRow, type PlatformTournament } from '../../data/platform'
import { personName } from './names'
import { relTime } from '../../lib/relTime'
import { TournamentChips, type TournamentsOutlet } from './TournamentsScreen'
import s from './Platform.module.css'
import { humanError } from '../../lib/humanError'

const P = t.platform
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export function TournamentDetail() {
  const { id = '' } = useParams()
  const api = usePlatformApi()
  const outlet = useOutletContext<TournamentsOutlet | undefined>()
  const [data, setData] = useState<PlatformTournament | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'unlock' | 'unprotect' | 'organizer' | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.tournament(id))
    } catch (e) {
      setError(humanError(e))
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
      toast(humanError(e))
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
  if (error) return <>{back}<ErrorBox error={error} onRetry={() => void load()} /></>
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
          {P.status[d.status]}, {P.code} {d.joinCode}, {P.created(relTime(d.createdAt))}
          {d.crew ? `, ${P.crew(d.crew.name)}` : ''}
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
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setSheet('organizer')}>
            {P.addOrganizer}
          </button>
        </div>
        {d.organizers.length === 0 ? (
          <p className={s.help}>{P.noComite}</p>
        ) : (
          <div className={s.rows}>
            {d.organizers.map((o) => (
              <div key={o.userId} className={s.row}>
                <Link className={s.rowLink} to={`../../personas/${o.userId}`} relative="path">
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{o.name}</span>
                    <span className={s.rowSub}>{[o.role === 'owner' ? P.roleOwner : P.roleAdmin, o.email].join(', ')}</span>
                  </span>
                </Link>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setRemoving(o.userId)}>
                  {P.removeOrganizer}
                </button>
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
                  <span className={s.rowSub}>{[a.platform ? P.byPlatform : a.actor, a.reason].filter(Boolean).join(', ') || '—'}</span>
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
        open={!!removing}
        title={P.removeOrganizer}
        body={d.organizers.find((o) => o.userId === removing)?.email ?? undefined}
        confirmLabel={P.removeOrganizer}
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (!removing) return
          await api.setOrganizer(d.id, removing, null, reason)
          await changed()
        }}
      />
      <AddOrganizerSheet
        open={sheet === 'organizer'}
        onClose={() => setSheet(null)}
        onPick={async (userId, reason) => {
          await api.setOrganizer(d.id, userId, 'owner', reason)
          await changed()
        }}
      />
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

/** Search an account, say why, make it the tournament's owner. Accounts only: a phone cannot run a Comité. */
function AddOrganizerSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (userId: string, reason: string) => Promise<void> }) {
  const api = usePlatformApi()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<PersonRow[]>([])
  const [picked, setPicked] = useState<PersonRow | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setQ('')
    setRows([])
    setPicked(null)
    setReason('')
    setError(null)
  }, [open])
  useEffect(() => {
    if (!open || q.trim().length < 2) return
    const id = window.setTimeout(() => {
      api.people({ q, filter: 'accounts', limit: 8 }).then((r) => setRows(r.rows), () => setRows([]))
    }, 250)
    return () => window.clearTimeout(id)
  }, [open, q, api])

  async function go() {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      await onPick(picked.id, reason.trim())
      onClose()
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={P.addOrganizerTitle}>
      <div className={s.section}>
        <p className={s.help}>{P.addOrganizerBody}</p>
        <Input type="search" value={q} placeholder={P.people.search} aria-label={P.people.search} onChange={(e) => setQ(e.target.value)} />
        <div className={s.rows} role="listbox" aria-label={P.addOrganizerPick}>
          {(q.trim().length < 2 ? [] : rows).map((r) => (
            <button key={r.id} type="button" role="option" aria-selected={picked?.id === r.id} className={`${s.row} ${s.rowPick} ${picked?.id === r.id ? s.rowActive : ''}`} onClick={() => setPicked(r)}>
              <span className={s.rowText}>
                <span className={s.rowTitle}>{personName(r)}</span>
                <span className={s.rowSub}>{r.email}</span>
              </span>
            </button>
          ))}
        </div>
        <Field label={P.reason} error={error}>
          <Input value={reason} maxLength={200} placeholder={P.reasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <button className="btn btn--primary btn--block" type="button" disabled={busy || !picked || reason.trim().length < 3} onClick={() => void go()}>
          {busy ? t.common.saving : P.addOrganizer}
        </button>
      </div>
    </Sheet>
  )
}

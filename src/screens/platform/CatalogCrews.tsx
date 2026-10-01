/**
 * Crews: every crew on Polo, its members and outings. The admin can take
 * someone out (the crew follows the same rules as leaving it) or delete a
 * crew; its tournaments stay.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useOutlet, useOutletContext, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, ErrorBox, Sheet, Spinner, toast } from '../../components/ui'
import { leaveSheetHistory } from '../../components/sheetHistory'
import { Field, Input } from '../../components/primitives'
import { ReasonSheet } from '../../components/ReasonSheet'
import { IconChevronLeft } from '../../components/icons'
import { usePlatformApi, type CrewRow, type PlatformCrew } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import type { TournamentsOutlet } from './TournamentsScreen'
import { usePaged } from './usePaged'
import s from './Platform.module.css'
import { humanError } from '../../lib/humanError'

const K = t.platform.crews

export function CatalogCrews() {
  const api = usePlatformApi()
  const outlet = useOutlet()
  const { id: openId } = useParams()
  const [q, setQ] = useState('')
  const fetch = useCallback((offset: number) => api.crews({ q, limit: 50, offset }), [api, q])
  const { rows, total, error, loadingMore, reload, more } = usePaged(fetch, !!q)

  return (
    <div className={`${s.split} ${outlet ? s.hasDetail : ''}`}>
      <div className={s.listPane}>
        <h2>{t.platform.sections.crews}</h2>
        <Input type="search" value={q} placeholder={K.search} aria-label={K.search} onChange={(e) => setQ(e.target.value)} />
        {error ? (
          <ErrorBox error={error} onRetry={() => void reload()} />
        ) : !rows ? (
          <Spinner rows={5} />
        ) : rows.length === 0 ? (
          <p className={s.help}>{K.empty}</p>
        ) : (
          <>
            <span className={s.help}>{K.count(rows.length, total)}</span>
            <div className={s.rows}>
              {rows.map((r) => (
                <CrewLine key={r.id} r={r} active={r.id === openId} />
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
        {outlet ? <Outlet context={{ onChanged: () => void reload() } satisfies TournamentsOutlet} /> : <p className={s.placeholder}>{K.pickOne}</p>}
      </div>
    </div>
  )
}

function CrewLine({ r, active }: { r: CrewRow; active: boolean }) {
  return (
    <Link className={`${s.row} ${active ? s.rowActive : ''}`} to={r.id} aria-current={active ? 'page' : undefined}>
      <span className={s.rowText}>
        <span className={s.rowTitle}>{r.name}</span>
        <span className={s.rowSub}>{K.rowSub(r.members, r.outings, r.ownerName)}</span>
      </span>
      <span className={s.rowEnd}>{r.lastOutingAt ? relTime(r.lastOutingAt) : K.noOutings}</span>
    </Link>
  )
}

export function CrewDetail() {
  const { id = '' } = useParams()
  const api = usePlatformApi()
  const navigate = useNavigate()
  const outlet = useOutletContext<TournamentsOutlet | undefined>()
  const [c, setC] = useState<PlatformCrew | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<PlatformCrew['members'][number] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setC(await api.crew(id))
    } catch (e) {
      setError(humanError(e))
    }
  }, [api, id])
  useEffect(() => {
    setC(undefined)
    void load()
  }, [load])

  const back = (
    <Link className={`btn btn--ghost btn--sm ${s.backLink}`} to=".." relative="path">
      <IconChevronLeft size={18} />
      {K.back}
    </Link>
  )
  if (error) return <>{back}<ErrorBox error={error} onRetry={() => void load()} /></>
  if (c === undefined) return <Spinner rows={6} />
  if (c === null) return <>{back}<p className={s.help}>{K.notFound}</p></>
  const crew = c
  const gone = () => {
    outlet?.onChanged()
    // From a sheet: its history entry goes first, so back never returns to the deleted crew (PWA-05).
    void leaveSheetHistory().then(() => navigate('..', { relative: 'path', replace: true }))
  }

  return (
    <div className={s.screen}>
      {back}
      <div className={s.detailHead}>
        <h2>{crew.name}</h2>
        <span className={s.help}>{[`${K.code} ${crew.joinCode}`, `/c/${crew.slug}`, relTime(crew.createdAt)].join(', ')}</span>
        <div className={s.actions}>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setDeleting(true)}>
            {K.delete}
          </button>
        </div>
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{K.members}</strong>
        </div>
        <div className={s.rows}>
          {crew.members.map((m) => (
            <div key={m.profileId} className={s.row}>
              <Link className={s.rowLink} to={`../../personas/${m.profileId}`} relative="path">
                <Avatar name={m.displayName} url={m.avatarUrl} size="sm" />
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{m.displayName}</span>
                  <span className={s.rowSub}>{[m.role === 'owner' ? K.owner : K.member, `@${m.handle}`, K.joined(relTime(m.joinedAt))].join(', ')}</span>
                </span>
              </Link>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setRemoving(m)}>
                {K.remove}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{K.outings}</strong>
        </div>
        {crew.outings.length === 0 ? (
          <p className={s.help}>{K.noOutings}</p>
        ) : (
          <div className={s.rows}>
            {crew.outings.map((o) => (
              <Link key={o.tournamentId} className={s.row} to={`../../torneos/${o.tournamentId}`} relative="path">
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{o.name}</span>
                  <span className={s.rowSub}>{[t.platform.status[o.status], o.quick ? t.platform.chips.quick : null, relTime(o.createdAt)].filter(Boolean).join(', ')}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {crew.activity.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <strong>{t.platform.people.activity}</strong>
          </div>
          <div className={s.rows}>
            {crew.activity.map((x) => (
              <div key={x.id} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{K.activity[x.action] ?? x.action}</span>
                  {x.reason && <span className={s.rowSub}>{x.reason}</span>}
                </span>
                <span className={s.rowEnd}>{relTime(x.at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <ReasonSheet
        open={!!removing}
        title={removing ? K.removeTitle(removing.displayName) : ''}
        body={crew.members.length === 1 ? K.removeBodyLast : removing?.profileId === crew.ownerId ? K.removeBodyOwner : K.removeBody}
        confirmLabel={K.remove}
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (!removing) return
          const outcome = await api.removeCrewMember(crew.id, removing.profileId, reason)
          toast(K.removed[outcome] ?? K.removed.removed!)
          if (outcome === 'deleted') gone()
          else {
            await load()
            outlet?.onChanged()
          }
        }}
      />
      <DeleteCrewSheet
        open={deleting}
        crew={crew}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          toast(K.deleted)
          gone()
        }}
      />
    </div>
  )
}

function DeleteCrewSheet({ open, crew, onClose, onDeleted }: { open: boolean; crew: PlatformCrew; onClose: () => void; onDeleted: () => void }) {
  const api = usePlatformApi()
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setConfirm('')
      setReason('')
      setError(null)
    }
  }, [open])
  async function go() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteCrew(crew.id, confirm.trim(), reason.trim())
      onClose()
      onDeleted()
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={K.deleteTitle}>
      <div className={s.section}>
        <p className={s.help}>{K.deleteBody}</p>
        <Field label={K.deleteConfirm(crew.name)}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Field label={t.platform.reason} error={error}>
          <Input value={reason} maxLength={200} placeholder={t.platform.reasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <button className="btn btn--danger btn--block" type="button" disabled={busy || confirm.trim() !== crew.name || reason.trim().length < 3} onClick={() => void go()}>
          {busy ? t.common.saving : K.delete}
        </button>
      </div>
    </Sheet>
  )
}

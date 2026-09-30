/**
 * One person, as the platform admin sees them: who they are, where they
 * play or organize, their crews and friends (as counts), PIN locks, what
 * the admin already did to them, and the actions — block, unblock, delete,
 * clear a PIN lock, drop a player link. Never shown for the admin himself
 * or another platform admin: the server refuses those anyway.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, ErrorBox, Sheet, Spinner, toast } from '../../components/ui'
import { Field, Input } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { ReasonSheet } from '../../components/ReasonSheet'
import { IconChevronLeft } from '../../components/icons'
import { usePlatformApi, type DeletePreview, type Person } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import type { TournamentsOutlet } from './TournamentsScreen'
import { clock, personName } from './names'
import s from './Platform.module.css'

const H = t.platform.people

type Pending =
  | { kind: 'block' }
  | { kind: 'unblock' }
  | { kind: 'delete' }
  | { kind: 'lock'; userId?: string; playerId?: string }
  | { kind: 'unlink'; playerId: string; label: string }
  | null

export function PersonDetail() {
  const { id = '' } = useParams()
  const api = usePlatformApi()
  const navigate = useNavigate()
  const outlet = useOutletContext<TournamentsOutlet | undefined>()
  const [p, setP] = useState<Person | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setP(await api.person(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, id])
  useEffect(() => {
    setP(undefined)
    void load()
  }, [load])
  const changed = async () => {
    await load()
    outlet?.onChanged()
  }

  const back = (
    <Link className={`btn btn--ghost btn--sm ${s.backLink}`} to=".." relative="path">
      <IconChevronLeft size={18} />
      {H.back}
    </Link>
  )
  if (error) return <>{back}<ErrorBox message={error} onRetry={() => void load()} /></>
  if (p === undefined) return <Spinner rows={6} />
  if (p === null) return <>{back}<p className={s.help}>{H.notFound}</p></>

  const name = p.anonymous ? H.phone : personName({ displayName: p.profile?.displayName ?? null, email: p.email, devicePlayer: null })
  const locked = !!p.deviceLock || p.playerLocks.length > 0
  const actionable = !p.isSelf && !p.isAdmin
  const pr = p.profile
  const profileLine = pr
    ? [pr.fullName !== pr.displayName ? pr.fullName : null, pr.homeClub, pr.city, pr.index != null ? H.index(pr.index.toFixed(1)) : null, pr.discoverable ? null : H.hidden].filter(Boolean).join(' · ')
    : ''

  return (
    <div className={s.screen}>
      {back}
      <div className={s.detailHead}>
        <div className={s.personHead}>
          <Avatar name={name} url={p.profile?.avatarUrl} size="lg" />
          <div className={s.rowText}>
            <h2>{name}</h2>
            <span className={s.help}>{[p.profile ? `@${p.profile.handle}` : null, p.profile ? p.email : null].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <span className={s.chips}>
          <span className="chip chip--outline">{H.provider[p.provider] ?? p.provider}</span>
          {p.blocked && <span className="chip chip--coral">{H.chips.blocked}</span>}
          {p.isAdmin && <span className="chip chip--teal">{H.chips.admin}</span>}
          {p.isSelf && <span className="chip chip--outline">{H.chips.you}</span>}
        </span>
        <span className={s.help}>
          {[H.joined(relTime(p.createdAt)), p.lastSignInAt ? H.lastSeen(relTime(p.lastSignInAt)) : H.neverSeen, !p.anonymous && !p.confirmedAt ? H.unconfirmed : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {p.profile && (
          <div className={s.actions}>
            <Link className="btn btn--secondary btn--sm" to={`/p/${p.profile.handle}`}>
              {H.viewProfile}
            </Link>
          </div>
        )}
      </div>

      {profileLine && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <strong>{H.profile}</strong>
          </div>
          <span className={s.help}>{profileLine}</span>
        </section>
      )}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{H.tournaments}</strong>
        </div>
        {p.tournaments.length === 0 ? (
          <p className={s.help}>{H.noTournaments}</p>
        ) : (
          <div className={s.rows}>
            {p.tournaments.map((x) => (
              <div key={x.tournamentId} className={s.row}>
                <Link className={s.rowLink} to={`../../torneos/${x.tournamentId}`} relative="path">
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{x.name}</span>
                    <span className={s.rowSub}>
                      {H.tournamentLine(x.role ? H.role[x.role]! : null, x.link ? H.link[x.link]! : null, x.playerName) || t.platform.status[x.status]}
                    </span>
                  </span>
                </Link>
                {(x.link === 'confirmed' || x.link === 'pending') && x.playerId && (
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => setPending({ kind: 'unlink', playerId: x.playerId!, label: `${x.playerName ?? ''} · ${x.name}` })}>
                    {H.unlink}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!p.anonymous && (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <strong>{H.social}</strong>
          </div>
          <span className={s.help}>{H.friends(p.friends, p.pendingFriends)}</span>
          <span className={s.help}>{H.push(p.push.count, p.push.hosts.join(', '))}</span>
          {p.crews.length > 0 && (
            <div className={s.rows}>
              {p.crews.map((c) => (
                <div key={c.id} className={s.row}>
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{c.name}</span>
                    <span className={s.rowSub}>{H.crewLine(c.role, c.members)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{H.pin}</strong>
        </div>
        {!locked ? (
          <p className={s.help}>{H.noPinLocks}</p>
        ) : (
          <div className={s.rows}>
            {p.deviceLock && (
              <div className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{H.deviceLock(p.deviceLock.failed, p.deviceLock.lockedUntil ? clock(p.deviceLock.lockedUntil) : null)}</span>
                </span>
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => setPending({ kind: 'lock', userId: p.id })}>
                  {H.clearLock}
                </button>
              </div>
            )}
            {p.playerLocks.map((l) => (
              <div key={l.playerId} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{H.playerLock(l.name, l.tournament, l.lockedUntil ? clock(l.lockedUntil) : null)}</span>
                </span>
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => setPending({ kind: 'lock', playerId: l.playerId })}>
                  {H.clearLock}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{H.manage}</strong>
        </div>
        {!actionable ? (
          <p className={s.help}>{p.isSelf ? H.cantSelf : H.cantAdmin}</p>
        ) : (
          <div className={s.actions}>
            {p.blocked ? (
              <button className="btn btn--secondary" type="button" onClick={() => setPending({ kind: 'unblock' })}>
                {H.unblock}
              </button>
            ) : (
              <button className="btn btn--secondary" type="button" onClick={() => setPending({ kind: 'block' })}>
                {H.block}
              </button>
            )}
            <button className="btn btn--danger" type="button" onClick={() => setPending({ kind: 'delete' })}>
              {H.delete}
            </button>
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{H.activity}</strong>
        </div>
        {p.activity.length === 0 ? (
          <p className={s.help}>{H.noActivity}</p>
        ) : (
          <div className={s.rows}>
            {p.activity.map((x) => (
              <div key={x.id} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{H.actions[x.action] ?? x.action}</span>
                  {x.reason && <span className={s.rowSub}>{x.reason}</span>}
                </span>
                <span className={s.rowEnd}>{relTime(x.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReasonSheet
        open={pending?.kind === 'block'}
        title={H.blockTitle}
        body={H.blockBody}
        confirmLabel={H.block}
        danger
        onClose={() => setPending(null)}
        onConfirm={async (reason) => {
          await api.block(p.id, reason)
          await changed()
          toast(H.done)
        }}
      />
      <ReasonSheet
        open={pending?.kind === 'unblock'}
        title={H.unblockTitle}
        body={H.unblockBody}
        confirmLabel={H.unblock}
        onClose={() => setPending(null)}
        onConfirm={async (reason) => {
          await api.unblock(p.id, reason)
          await changed()
          toast(H.done)
        }}
      />
      <ReasonSheet
        open={pending?.kind === 'lock'}
        title={H.clearLockTitle}
        body={H.clearLockBody}
        confirmLabel={H.clearLock}
        onClose={() => setPending(null)}
        onConfirm={async (reason) => {
          if (pending?.kind !== 'lock') return
          await api.resetPinLock({ userId: pending.userId, playerId: pending.playerId }, reason)
          await changed()
          toast(H.done)
        }}
      />
      <ConfirmSheet
        open={pending?.kind === 'unlink'}
        title={H.unlink}
        body={pending?.kind === 'unlink' ? pending.label : undefined}
        confirmLabel={H.unlink}
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending?.kind !== 'unlink') return
          setBusy(true)
          try {
            await api.unlinkPlayer(pending.playerId)
            await changed()
            toast(H.unlinked)
            setPending(null)
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(false)
          }
        }}
      />
      <DeleteAccountSheet
        open={pending?.kind === 'delete'}
        person={p}
        onClose={() => setPending(null)}
        onBlockInstead={() => setPending({ kind: 'block' })}
        onDeleted={() => {
          toast(H.deleted)
          outlet?.onChanged()
          navigate('..', { relative: 'path', replace: true })
        }}
      />
    </div>
  )
}

/**
 * Delete, the Cardigan way: say exactly what goes, make them type the
 * email (a phone: BORRAR), ask why, and offer blocking as the way out.
 */
function DeleteAccountSheet({ open, person, onClose, onBlockInstead, onDeleted }: { open: boolean; person: Person; onClose: () => void; onBlockInstead: () => void; onDeleted: () => void }) {
  const api = usePlatformApi()
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setConfirm('')
    setReason('')
    setError(null)
    setPreview(null)
    api.deletePreview(person.id).then(setPreview, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [open, api, person.id])

  const word = person.email ?? 'BORRAR'
  const matches = person.email ? confirm.trim().toLowerCase() === person.email.toLowerCase() : confirm.trim().toUpperCase() === 'BORRAR'
  const ready = matches && reason.trim().length >= 3 && !!preview

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await api.deleteAccount(person.id, confirm, reason.trim())
      onClose()
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const lines = preview
    ? [
        preview.orphaned.length ? H.deleteOrphaned(preview.orphaned.map((x) => x.name).join(', ')) : null,
        preview.organizerOf > preview.orphaned.length ? H.deleteOrganizer(preview.organizerOf) : null,
        preview.linkedPlayers ? H.deletePlayers(preview.linkedPlayers) : null,
        preview.crewsHanded.length ? H.deleteCrewsHanded(preview.crewsHanded.join(', ')) : null,
        preview.crewsDeleted.length ? H.deleteCrewsDeleted(preview.crewsDeleted.join(', ')) : null,
        preview.friendships || preview.rivalries ? H.deleteSocial(preview.friendships, preview.rivalries) : null,
        preview.hasProfile ? H.deleteProfile : null,
      ].filter((x): x is string => !!x)
    : []

  return (
    <Sheet open={open} onClose={onClose} title={H.deleteTitle}>
      <div className={s.section}>
        <p className={s.help}>{H.deleteIntro}</p>
        {!preview && !error ? (
          <Spinner rows={3} />
        ) : (
          <ul className={s.bullets}>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        <Field label={person.email ? H.deleteConfirmEmail(word) : H.deleteConfirmWord}>
          <Input value={confirm} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Field label={t.platform.reason} error={error}>
          <Input value={reason} maxLength={200} placeholder={t.platform.reasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className={s.actions}>
          {!person.blocked && (
            <button
              className="btn btn--secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                onClose()
                onBlockInstead()
              }}
            >
              {H.deleteInstead}
            </button>
          )}
          <button className="btn btn--danger" type="button" disabled={busy || !ready} onClick={() => void go()}>
            {busy ? t.common.saving : H.delete}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

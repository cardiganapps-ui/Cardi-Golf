/**
 * `/c/:slug`: a crew's home. The season table (points by finish, the leader
 * on top, last year's champion), its outings, a new outing, its members, the
 * invite (code and link), and leaving. Its owner also decides who is in it
 * (0071, TRUST-11): «Sacar» a member, «Aprobar solicitudes» (the code then
 * leaves a request he accepts or declines), and how long a new code lasts.
 */
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, CopyButton, ErrorBox, Segmented, ShareButton, Spinner, Toggle } from '../../components/ui'
import { leaveSheetHistory } from '../../components/sheetHistory'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { IconChevronLeft, IconChevronRight } from '../../components/icons'
import { crewPage, leaveCrew, removeCrewMember, respondCrewRequest, rotateCrewCode, setCrewApproval, type CrewMember, type CrewOuting, type CrewPage } from '../../data/crews'
import { formatIndex } from '../../data/profiles'
import { seasons, seasonTable } from '../../engine/profile/season'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'
import { useServerQuery } from '../../data/query'
import { useServerMutation } from '../../components/useServerMutation'

const C = t.crews
const dayMonth = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const pts = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
/** How long a new code lasts, as rotate_crew_code takes it (null: no end). */
const DAYS = { never: null, d7: 7, d30: 30 } as const
type Days = keyof typeof DAYS
const longDay = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' })

function OutingRow({ o }: { o: CrewOuting }) {
  return (
    <Link to={`/t/${o.slug}`} className={styles.row}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{o.name}</span>
        <span className={styles.rowSub}>
          {[o.date ? dayMonth.format(new Date(`${o.date}T12:00:00Z`)) : null, C.playersCount(o.players), o.status === 'finished' ? null : t.status[o.status].toLowerCase(), o.practice ? t.profile.practice : null].filter(Boolean).join(', ')}
        </span>
      </span>
      <span className={styles.rowEnd}>
        <IconChevronRight size={20} />
      </span>
    </Link>
  )
}

export function CrewView({ page, now = new Date(), onChanged }: { page: CrewPage; now?: Date; onChanged?: () => void }) {
  const navigate = useNavigate()
  const years = useMemo(() => seasons(page.results), [page.results])
  const [year, setYear] = useState(() => years[0] ?? now.getFullYear())
  const rows = useMemo(() => seasonTable(page.results, year), [page.results, year])
  const [ask, setAsk] = useState<'rotate' | 'leave' | null>(null)
  const { run, busy } = useServerMutation({ invalidates: [['crews', 'mine']] })
  const [days, setDays] = useState<Days>('never')
  const [removing, setRemoving] = useState<CrewMember | null>(null)
  const owner = page.crew.role === 'owner'
  const requests = page.requests ?? []
  const member = new Map(page.members.map((m) => [m.handle, m]))
  const { crew } = page
  const link = `${window.location.origin}/c/unirme/${crew.joinCode}`
  const upcoming = page.outings.filter((o) => o.status !== 'finished')
  const past = page.outings.filter((o) => o.status === 'finished')
  const closed = year < now.getFullYear()

  async function act(which: 'rotate' | 'leave') {
    if (!onChanged) return
    await run(async () => {
      if (which === 'rotate') {
        await rotateCrewCode(crew.id, DAYS[days])
        onChanged()
        return
      }
      await leaveCrew(crew.id)
      // From the confirm sheet: its history entry goes first, so the replace lands on this page's entry (PWA-05).
      await leaveSheetHistory()
      navigate('/crews', { replace: true })
    })
    setAsk(null)
  }

  /** One owner's step, then the page read again; the toast says how it went. */
  async function own(step: () => Promise<unknown>, done: string) {
    await run(async () => {
      await step()
      onChanged?.()
    }, { done })
  }

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/crews" className={styles.iconBtn} aria-label={t.common.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{crew.name}</h1>
        <span className={styles.iconSpacer} />
      </div>

      {/* The season */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">{C.season(year)}</span>
          {years.length > 1 && <Segmented value={String(year)} label={C.table} options={years.map((y) => ({ value: String(y), label: String(y) }))} onChange={(v) => setYear(Number(v))} />}
        </div>
        {rows.length === 0 ? (
          <p className={styles.help}>{C.noSeason}</p>
        ) : (
          <div className={styles.rows}>
            {rows.map((r) => {
              const m = member.get(r.handle)
              return (
                <Link key={r.handle} to={`/p/${r.handle}`} className={`${styles.row} ${r.position === 1 ? styles.rowUsed : ''}`}>
                  <span className={styles.pos}>{r.label}</span>
                  <Avatar name={m?.displayName ?? r.handle} url={m?.avatarUrl} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{m?.displayName ?? `@${r.handle}`}</span>
                    <span className={styles.rowSub}>{[r.position === 1 ? (closed ? C.champion(year) : C.leader) : null, C.events(r.events), r.wins ? C.wins(r.wins) : null].filter(Boolean).join(', ')}</span>
                  </span>
                  <span className={styles.rowEnd}>
                    <span className={styles.rowFig}>{pts(r.points)}</span>
                    <span>{C.pts}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
        <p className={styles.help}>{C.tableHow}</p>
      </section>

      {/* Outings */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">{C.outings}</span>
        </div>
        <Link to={`/ronda?crew=${crew.id}`} className={`btn btn--primary ${styles.start}`}>
          {C.newOuting}
        </Link>
        {page.outings.length === 0 && <p className={styles.help}>{C.noOutings}</p>}
        {upcoming.length > 0 && (
          <>
            <span className={styles.help}>{C.upcoming}</span>
            <div className={styles.rows}>
              {upcoming.map((o) => (
                <OutingRow key={o.tournamentId} o={o} />
              ))}
            </div>
          </>
        )}
        {past.length > 0 && (
          <>
            <span className={styles.help}>{C.past}</span>
            <div className={styles.rows}>
              {past.map((o) => (
                <OutingRow key={o.tournamentId} o={o} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Members */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">{t.crews.members(page.members.length)}</span>
        </div>
        <div className={styles.rows}>
          {page.members.map((m) => {
            const row = (
              <Link key={m.handle} to={`/p/${m.handle}`} className={styles.row}>
                <Avatar name={m.displayName} url={m.avatarUrl} />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{m.displayName}</span>
                  <span className={styles.rowSub}>{[`@${m.handle}`, m.role === 'owner' ? C.owner : null].filter(Boolean).join(', ')}</span>
                </span>
                {m.index != null && <span className={styles.rowFig}>{formatIndex(m.index)}</span>}
              </Link>
            )
            // The owner takes a member out from his row; never himself (that is «Salir del crew»).
            if (!owner || m.role === 'owner') return row
            return (
              <div key={m.handle} className={styles.memberRow}>
                {row}
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} aria-label={C.removeTitle(m.displayName)} onClick={() => setRemoving(m)}>
                  {C.remove}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Who waits to enter: the owner's to answer (0071). */}
      {owner && requests.length > 0 && (
        <section className={styles.section}>
          <span className="label">{C.requests(requests.length)}</span>
          <div className={styles.rows}>
            {requests.map((r) => (
              <div key={r.handle} className={styles.memberRow}>
                <span className={styles.row}>
                  <Avatar name={r.displayName} url={r.avatarUrl} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{r.displayName}</span>
                    <span className={styles.rowSub}>{`@${r.handle}`}</span>
                  </span>
                </span>
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void own(() => respondCrewRequest(crew.id, r.handle, true), C.accepted(r.displayName))}>
                  {C.accept}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void own(() => respondCrewRequest(crew.id, r.handle, false), C.declined(r.displayName))}>
                  {C.decline}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite */}
      <section className={styles.section}>
        <span className="label">{C.invite}</span>
        <p className={styles.help}>{C.inviteHint}</p>
        <div className={styles.stat}>
          <span className={styles.statFigure}>{crew.joinCode}</span>
        </div>
        {crew.codeExpired ? (
          <p className="error">{C.codeExpired}</p>
        ) : (
          crew.codeExpiresAt && <p className={styles.help}>{C.codeUntil(longDay.format(new Date(crew.codeExpiresAt)))}</p>
        )}
        {owner && crew.approval !== undefined && (
          <Toggle label={C.approval} hint={C.approvalHint} checked={crew.approval} onChange={(on) => void own(() => setCrewApproval(crew.id, on), t.common.saved)} />
        )}
        <div className={styles.actions}>
          <CopyButton text={link} label={t.profile.copyLink} />
          <ShareButton text={C.shareText(crew.name)} url={link} title={crew.name} />
        </div>
        <div className={styles.quiet}>
          {crew.role === 'owner' && (
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setAsk('rotate')}>
              {C.rotate}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setAsk('leave')}>
            {C.leave}
          </button>
        </div>
      </section>

      <ConfirmSheet
        open={!!ask}
        title={ask === 'rotate' ? C.rotate : C.leave}
        body={ask === 'rotate' ? C.rotateConfirm : C.leaveConfirm(crew.name)}
        danger={ask === 'leave'}
        busy={busy}
        confirmLabel={ask === 'rotate' ? C.rotate : C.leave}
        onConfirm={() => ask && void act(ask)}
        onClose={() => setAsk(null)}
      >
        {ask === 'rotate' && crew.approval !== undefined && (
          <Segmented<Days> value={days} label={C.rotateFor} options={(Object.keys(DAYS) as Days[]).map((d) => ({ value: d, label: C.rotateDays[d] }))} onChange={setDays} />
        )}
      </ConfirmSheet>
      <ConfirmSheet
        open={!!removing}
        title={removing ? C.removeTitle(removing.displayName) : ''}
        body={removing ? C.removeBody(removing.displayName, crew.name) : undefined}
        danger
        busy={busy}
        confirmLabel={C.remove}
        onConfirm={() => {
          const m = removing
          if (!m) return
          void own(() => removeCrewMember(crew.id, m.handle), C.removed(m.displayName)).then(() => setRemoving(null))
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}

export function CrewScreen() {
  const { slug = '' } = useParams()
  const ok = useRequireAccount(`/c/${slug}`)
  const q = useServerQuery(['crews', 'page', slug], () => crewPage(slug), { enabled: ok })
  const page: CrewPage | null | undefined = q.data
  const { refetch } = q
  const load = useCallback(() => void refetch(), [refetch])
  if (ok && page === undefined && q.error) return <ErrorBox error={q.error} onRetry={load} />
  if (!ok || page === undefined) return <Spinner />
  if (!page) return <EmptyState title={t.social.notFound} body={C.none} action={<Link className="btn btn--secondary" to="/crews">{C.title}</Link>} />
  return <CrewView key={page.crew.id} page={page} onChanged={load} />
}

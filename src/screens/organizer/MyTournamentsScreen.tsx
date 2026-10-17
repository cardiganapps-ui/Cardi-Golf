/**
 * Mis torneos: what is live first, then what is being set up, then what is
 * over. One row per tournament; the Comité is one tap away.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Avatar, ErrorBox, Spinner } from '../../components/ui'
import { toast } from '../../components/toast'
import { Button, EmptyState } from '../../components/primitives'
import { useAuth } from '../../data/auth'
import { signOutSafely } from '../../data/account'
import { listMyTournaments, type MyTournament } from '../../data/api'
import styles from './Organizer.module.css'
import { useServerQuery } from '../../data/query'
import { buttonClass } from '../../components/buttonClass'

const GROUPS: Array<{ key: 'live' | 'setup' | 'finished'; statuses: string[]; label: string; quiet?: boolean }> = [
  { key: 'live', statuses: ['live', 'auction'], label: t.organizer.groupLive },
  { key: 'setup', statuses: ['setup'], label: t.organizer.groupSetup },
  { key: 'finished', statuses: ['finished'], label: t.organizer.groupFinished, quiet: true },
]

export function MyTournamentsScreen() {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const signedIn = ready && !!user && !isAnonymous
  const q = useServerQuery(['organizer', 'tournaments'], () => listMyTournaments(), { enabled: signedIn })
  const items = q.data ?? null
  const error = items ? null : q.error
  /** Waiting for the server to end the session: on lie-fi that takes until auth-js's own deadline. */
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (ready && (!user || isAnonymous)) navigate('/organizer/login', { replace: true })
  }, [ready, user, isAnonymous, navigate])

  // One row per tournament even when the account holds several organizer rows (logged in DESIGN_NOTES.md).
  const unique = useMemo(() => {
    const seen = new Map<string, MyTournament>()
    for (const it of items ?? []) if (!seen.has(it.id)) seen.set(it.id, it)
    return [...seen.values()]
  }, [items])

  // The same sign-out as everywhere: never with holes still on the phone, and it takes the phone's saved boards.
  async function logout() {
    setSigningOut(true)
    try {
      const r = await signOutSafely()
      if (r.done) navigate('/')
      else toast(r.reason)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className={`${styles.screen} ${styles.mine}`}>
      <div className={styles.topRow}>
        <Link to="/" className={styles.brand}>
          <Wordmark />
        </Link>
        <Button variant="ghost" size="sm" disabled={signingOut} onClick={() => void logout()}>
          {signingOut ? t.account.signingOut : t.common.logout}
        </Button>
      </div>
      <div className={styles.titleRow}>
        <div>
          <h1>{t.organizer.myTournaments}</h1>
          {user && <span className="help">{user.email}</span>}
        </div>
        <Link className={buttonClass({ variant: 'primary', size: 'sm' })} to="/organizer/new">
          {t.organizer.newTournament}
        </Link>
      </div>
      {error && <ErrorBox error={error} onRetry={() => void q.refetch()} />}
      {!items && !error && <Spinner />}
      {items && unique.length === 0 && (
        <EmptyState
          title={t.organizer.empty}
          body={t.organizer.emptyHint}
          action={
            <Link className={buttonClass({ variant: 'primary' })} to="/organizer/new">
              {t.organizer.newTournament}
            </Link>
          }
        />
      )}
      {GROUPS.map((g) => {
        const rows = unique.filter((it) => g.statuses.includes(it.status))
        if (rows.length === 0) return null
        return (
          <section key={g.key} className={`${styles.group} ${g.quiet ? styles.quiet : ''}`}>
            <span className="label">{g.label}</span>
            <div className={styles.list}>
              {rows.map((it) => (
                <div key={it.id} className={styles.item}>
                  <Link className={styles.itemLink} to={`/t/${it.slug}`}>
                    <Avatar name={it.name} url={it.logoUrl} />
                    <span className={styles.itemText}>
                      <span className={styles.itemName}>{it.name}</span>
                      <span className={styles.itemSub}>
                        {t.status[it.status as keyof typeof t.status] ?? it.status}, {t.organizer.joinCode.toLowerCase()} <span className={styles.code}>{it.joinCode}</span>
                      </span>
                    </span>
                  </Link>
                  <Link className={buttonClass({ variant: 'secondary', size: 'sm' })} to={`/t/${it.slug}/admin`}>
                    {t.organizer.admin}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

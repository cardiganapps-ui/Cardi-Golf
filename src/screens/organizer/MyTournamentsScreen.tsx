/**
 * Mis torneos: what is live first, then what is being set up, then what is
 * over. One row per tournament; the Comité is one tap away.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Avatar, ErrorBox, Spinner } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { signOut, useAuth } from '../../data/auth'
import { listMyTournaments, type MyTournament } from '../../data/api'
import styles from './Organizer.module.css'
import { humanError } from '../../lib/humanError'

const GROUPS: Array<{ key: 'live' | 'setup' | 'finished'; statuses: string[]; label: string; quiet?: boolean }> = [
  { key: 'live', statuses: ['live', 'auction'], label: t.organizer.groupLive },
  { key: 'setup', statuses: ['setup'], label: t.organizer.groupSetup },
  { key: 'finished', statuses: ['finished'], label: t.organizer.groupFinished, quiet: true },
]

export function MyTournamentsScreen() {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const [items, setItems] = useState<MyTournament[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!user || isAnonymous) {
      navigate('/organizer/login', { replace: true })
      return
    }
    listMyTournaments()
      .then(setItems)
      .catch((e) => setError(humanError(e)))
  }, [ready, user, isAnonymous, navigate])

  // One row per tournament even when the account holds several organizer rows (logged in DESIGN_NOTES.md).
  const unique = useMemo(() => {
    const seen = new Map<string, MyTournament>()
    for (const it of items ?? []) if (!seen.has(it.id)) seen.set(it.id, it)
    return [...seen.values()]
  }, [items])

  return (
    <div className={styles.screen}>
      <div className={styles.topRow}>
        <Link to="/" className={styles.brand}>
          <Wordmark />
        </Link>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => signOut().then(() => navigate('/'))}>
          {t.common.logout}
        </button>
      </div>
      <div className={styles.titleRow}>
        <div>
          <h1>{t.organizer.myTournaments}</h1>
          {user && <span className="help">{user.email}</span>}
        </div>
        <Link className="btn btn--primary btn--sm" to="/organizer/new">
          {t.organizer.newTournament}
        </Link>
      </div>
      {error && <ErrorBox error={error} />}
      {!items && !error && <Spinner />}
      {items && unique.length === 0 && (
        <EmptyState
          title={t.organizer.empty}
          body={t.organizer.emptyHint}
          action={
            <Link className="btn btn--primary" to="/organizer/new">
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
                  <Link className="btn btn--secondary btn--sm" to={`/t/${it.slug}/admin`}>
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

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Avatar, ErrorBox, Spinner } from '../../components/ui'
import { signOut, useAuth } from '../../data/auth'
import { listMyTournaments, type MyTournament } from '../../data/api'

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
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [ready, user, isAnonymous, navigate])

  return (
    <div className="screen">
      <div className="row row--between">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => signOut().then(() => navigate('/'))}>
          {t.common.logout}
        </button>
      </div>
      <div className="screenTitle">
        <h1>{t.organizer.myTournaments}</h1>
        <Link className="btn btn--primary btn--sm" to="/organizer/new">
          {t.organizer.newTournament}
        </Link>
      </div>
      {user && <p className="help">{user.email}</p>}
      {error && <ErrorBox message={error} />}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <p className="muted">{t.organizer.empty}</p>}
      {items && items.length > 0 && (
        <div className="list">
          {items.map((it) => (
            <Link key={it.id} className="listItem" to={`/t/${it.slug}`}>
              <Avatar name={it.name} url={it.logoUrl} />
              <span className="grow">
                <strong>{it.name}</strong>
                <span className="help" style={{ display: 'block' }}>
                  {t.status[it.status as keyof typeof t.status] ?? it.status} · {t.organizer.joinCode} <span className="num">{it.joinCode}</span>
                </span>
              </span>
              <Link className="btn btn--secondary btn--sm" to={`/t/${it.slug}/admin`} onClick={(e) => e.stopPropagation()}>
                {t.organizer.admin}
              </Link>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

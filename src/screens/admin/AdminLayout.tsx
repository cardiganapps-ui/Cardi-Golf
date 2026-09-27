import { Link, NavLink, Outlet } from 'react-router'
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminLayout.module.css'

const SECTIONS = [
  { to: 'torneo', label: t.admin.sections.tournament },
  { to: 'jugadores', label: t.admin.sections.players },
  { to: 'campos', label: t.admin.sections.courses },
  { to: 'rondas', label: t.admin.sections.rounds },
  { to: 'grupos', label: t.admin.sections.groups },
  { to: 'handicaps', label: t.admin.sections.handicaps },
  { to: 'scores', label: t.admin.sections.scores },
  { to: 'calcutta', label: t.admin.sections.auction },
  { to: 'parejas', label: t.admin.sections.draw },
]

export function AdminLayout() {
  const { me, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  if (!me.isAdmin) {
    return (
      <div className="screen">
        <h1>{t.admin.title}</h1>
        <p className="muted">{t.errors.forbidden}</p>
        <Link className="btn btn--secondary" to={`/t/${slug}`}>
          {t.common.back}
        </Link>
      </div>
    )
  }
  return (
    <div className="screen">
      <div className="row row--between">
        <div>
          <span className="label">{t.admin.title}</span>
          <h1 style={{ fontSize: '1.5rem' }}>{data?.snapshot.tournament.name}</h1>
        </div>
        <Link className="btn btn--secondary btn--sm" to={`/t/${slug}`}>
          {t.nav.live}
        </Link>
      </div>
      <nav className={styles.nav} aria-label="Secciones del Comité">
        {SECTIONS.map((s) => (
          <NavLink key={s.to} to={`/t/${slug}/admin/${s.to}`} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

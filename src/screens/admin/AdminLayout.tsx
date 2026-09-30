/**
 * Comité shell: the tournament name, a way back to En vivo, and the sections
 * as tabs (a side column on a laptop). Sections carry a badge when the engine
 * flags something for them; modules that are off hide their section.
 */
import { Link, NavLink, Outlet } from 'react-router'
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { EmptyState } from '../../components/primitives'
import { PlatformBanner } from '../tournament/PlatformBanner'
import styles from './AdminLayout.module.css'

export function AdminLayout() {
  const { me, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  if (!me.isAdmin) {
    return (
      <div className={styles.layout}>
        {/* A Protegido tournament the platform admin has not unlocked: the banner is the way in. */}
        {me.via === 'platform' && <PlatformBanner />}
        <EmptyState
          title={t.admin.title}
          body={t.errors.forbidden}
          action={
            <Link className="btn btn--secondary" to={`/t/${slug}`}>
              {t.common.back}
            </Link>
          }
        />
      </div>
    )
  }
  const flags = data?.state.flags
  const settings = data?.settings
  const hot = (flags?.pendingSnakeTiebreaks.length ?? 0) + (flags?.discrepancies.length ?? 0)
  const scoresBadge = hot + (flags?.unsignedCards.length ?? 0)
  const roundsBadge = flags?.incompleteRounds.length ?? 0
  const tournamentBadge = (flags?.warnings.length ?? 0) + (flags?.missingModules.length ?? 0)
  const S = t.admin.sections
  const sections: Array<{ to: string; label: string; badge?: number; hot?: boolean; show?: boolean }> = [
    { to: 'torneo', label: S.tournament, badge: tournamentBadge },
    { to: 'jugadores', label: S.players },
    { to: 'campos', label: S.courses },
    { to: 'rondas', label: S.rounds, badge: roundsBadge },
    { to: 'grupos', label: S.groups },
    { to: 'handicaps', label: S.handicaps },
    { to: 'scores', label: S.scores, badge: scoresBadge, hot: hot > 0 },
    { to: 'calcutta', label: S.auction, show: settings?.modules.auction.enabled ?? true },
    { to: 'parejas', label: S.draw, show: settings?.modules.pairs.enabled ?? true },
    { to: 'equipos', label: S.teams, show: settings?.modules.individual.format === 'team' },
    { to: 'juegos', label: S.games, show: (settings?.games.length ?? 0) > 0 },
    { to: 'historial', label: S.history },
    { to: 'datos', label: S.data },
  ]
  return (
    <div className={styles.layout}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="label">{t.admin.title}</span>
          <h1>{data?.snapshot.tournament.name}</h1>
        </div>
        <Link className="btn btn--secondary btn--sm" to={`/t/${slug}`}>
          {t.nav.live}
        </Link>
      </div>
      {me.via === 'platform' && <PlatformBanner />}
      <div className={styles.body}>
        <nav className={styles.nav} aria-label={t.admin.sectionsLabel}>
          {sections
            .filter((s) => s.show !== false)
            .map((s) => (
              <NavLink key={s.to} to={`/t/${slug}/admin/${s.to}`} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
                {s.label}
                {s.badge ? (
                  <span className={`${styles.badge} ${s.hot ? styles.badgeHot : ''}`} aria-label={`${s.badge} ${t.admin.inbox.title.toLowerCase()}`}>
                    {s.badge}
                  </span>
                ) : null}
              </NavLink>
            ))}
        </nav>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

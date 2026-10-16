/**
 * Comité shell: the tournament name, a way back to En vivo, and the sections
 * as tabs (a side column on a laptop). Sections carry a badge when the engine
 * flags something for them; modules that are off hide their section.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/tournamentContext'
import { EmptyState } from '../../components/primitives'
import { PlatformBanner } from '../tournament/PlatformBanner'
import { SettingsGuard } from '../tournament/SettingsGuard'
import styles from './AdminLayout.module.css'
import { useEntryInfo } from './entryInfo'
import { readiness, setupBadge, teamPlay } from './readiness'
import {
  AdminAuction,
  AdminCourses,
  AdminData,
  AdminDraw,
  AdminGames,
  AdminGroups,
  AdminHandicaps,
  AdminHistory,
  AdminPlayers,
  AdminRounds,
  AdminScores,
  AdminTeams,
  AdminTournament,
} from '../../app/screens'
import { prefetchScreens, preloadOnIntent, type Preloadable } from '../../app/lazyScreen'

/**
 * On a phone the sections are a row that scrolls sideways: the one open is brought into view, in the middle of the
 * row when it can be, so Calcutta or Datos is never off the edge (UX-24). The row scrolls, the page doesn't.
 */
function useActiveInView(sectionsFrom: unknown) {
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const row = nav.current
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !active || row.scrollWidth <= row.clientWidth) return
    const r = row.getBoundingClientRect()
    const a = active.getBoundingClientRect()
    row.scrollLeft += a.left - r.left - (r.width - a.width) / 2
    // Again once the settings arrive: a section they turn on (Calcutta, Parejas, Equipos) moves the open one along.
  }, [pathname, sectionsFrom])
  return nav
}

/** Each section's screen, loaded on a tap's first touch and, once the Comité is open, when the page is idle (MOT-22). */
const SECTION_SCREENS: Record<string, Preloadable> = {
  torneo: AdminTournament,
  jugadores: AdminPlayers,
  campos: AdminCourses,
  rondas: AdminRounds,
  grupos: AdminGroups,
  handicaps: AdminHandicaps,
  scores: AdminScores,
  calcutta: AdminAuction,
  parejas: AdminDraw,
  equipos: AdminTeams,
  juegos: AdminGames,
  historial: AdminHistory,
  datos: AdminData,
}

/** What the Comité still reaches when this build can't read the settings (ARCH-04): the backup and the history compute nothing. */
const READS_NO_SETTINGS = /\/admin\/(datos|historial)\/?$/

export function AdminLayout() {
  const { me, slug, tournamentId } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const { pathname } = useLocation()
  const nav = useActiveInView(data?.settings)
  // While it is being set up, the tab counts what «Para empezar» lists (the same answer the card reads), and each engine warning it does not already cover.
  const setup = !!data && data.snapshot.tournament.status === 'setup' && !data.snapshot.tournament.quick
  const entry = useEntryInfo(tournamentId, data, { enabled: setup })
  const isComite = me.isComite
  useEffect(() => (isComite ? prefetchScreens(Object.values(SECTION_SCREENS)) : undefined), [isComite])
  if (!me.isComite) {
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
  const hot = (flags?.pendingSnakeTiebreaks.length ?? 0) + (flags?.discrepancies.length ?? 0) + (flags?.missingPutts.length ?? 0)
  const scoresBadge = hot + (flags?.unsignedCards.length ?? 0)
  const roundsBadge = flags?.incompleteRounds.length ?? 0
  const tournamentBadge =
    setup && data
      ? setupBadge(readiness(data.snapshot, data.settings, { pins: entry?.pins ?? null, linked: entry?.linked, bracket: data.state.bracket }), flags?.warnings ?? [], flags?.missingModules.length ?? 0)
      : (flags?.warnings.length ?? 0) + (flags?.missingModules.length ?? 0)
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
    { to: 'equipos', label: S.teams, show: !!settings && teamPlay(settings) != null },
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
        <nav ref={nav} className={styles.nav} aria-label={t.admin.sectionsLabel}>
          {sections
            .filter((s) => s.show !== false)
            .map((s) => (
              <NavLink key={s.to} to={`/t/${slug}/admin/${s.to}`} {...preloadOnIntent(SECTION_SCREENS[s.to])} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
                {s.label}
                {s.badge ? (
                  // A11Y-22: the count said with its words, inside the link's name; a label on a bare span is dropped.
                  <span className={`${styles.badge} ${s.hot ? styles.badgeHot : ''}`}>
                    <span aria-hidden="true">{s.badge}</span>
                    <span className="sr-only"> {t.admin.inbox.count(s.badge)}</span>
                  </span>
                ) : null}
              </NavLink>
            ))}
        </nav>
        <div className={styles.content}>
          {READS_NO_SETTINGS.test(pathname) ? <Outlet /> : <SettingsGuard><Outlet /></SettingsGuard>}
        </div>
      </div>
    </div>
  )
}

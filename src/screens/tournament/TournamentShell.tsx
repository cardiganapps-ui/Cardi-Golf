import { NavLink, Outlet, useLocation } from 'react-router'
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import styles from './TournamentShell.module.css'
import { IconCoin, IconFlag, IconGames, IconMore, IconPencil } from '../../components/icons'
import { LiveStatus } from '../../components/primitives'
import { useOnline } from '../../components/OfflineBanner'
import { nearestAccent } from '../../design/accents'
import { PlatformBanner } from './PlatformBanner'
import { useOutbox } from '../../data/outbox'

/**
 * The tabs a tournament actually has. §9 promises the bar shows only the
 * modules that are on, and it never did: a tournament with no money showed
 * Dinero with nothing in it, and someone watching without a player showed a
 * Tarjeta they cannot write on.
 */
function tabsFor({ hasMoney, canScore }: { hasMoney: boolean; canScore: boolean }) {
  return [
    { to: '', label: t.nav.live, icon: <IconFlag /> },
    ...(canScore ? [{ to: 'tarjeta', label: t.nav.card, icon: <IconPencil /> }] : []),
    { to: 'juegos', label: t.nav.games, icon: <IconGames /> },
    ...(hasMoney ? [{ to: 'dinero', label: t.nav.money, icon: <IconCoin /> }] : []),
    { to: 'mas', label: t.nav.more, icon: <IconMore /> },
  ]
}

/**
 * The tournament frame: a one-line header (event name, connection state)
 * and the tab bar. Everything else belongs to the screens.
 */
export function TournamentShell() {
  const { slug, lookup, me } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const realtime = useTournament((s) => s.realtime)
  const updatedAt = useTournament((s) => s.updatedAt)
  const isFixture = useTournament((s) => s.tournamentId?.startsWith('fixture:') ?? false)
  const online = useOnline()
  const { pathname } = useLocation()
  const underMore = /\/(stats|reglamento|imprimir|ceremonia)$/.test(pathname)
  const accent = data?.snapshot.tournament.accentColor ?? lookup.accentColor ?? undefined
  const logo = data?.snapshot.tournament.logoUrl ?? lookup.logoUrl
  // Money exists if anyone pays anything: the entry pot, a side pot, a direct
  // bet or the auction. Until the snapshot loads, assume it does, so the bar
  // does not shuffle under a thumb already on its way to a tab.
  const s = data?.settings
  const hasMoney = !s || s.entryFee > 0 || s.modules.auction.enabled || s.games.some((g) => g.money.source !== 'none')
  const canScore = !!me.playerId || me.isAdmin
  const tabs = tabsFor({ hasMoney, canScore })
  // Holes still on this phone, and writes the server refused: on the Tarjeta
  // tab from every screen, not only inside the Tarjeta (REL-17).
  const pendingHoles = useOutbox((st) => st.pendingHoles)
  const rejectedCount = useOutbox((st) => st.rejected.length)

  return (
    <div className={styles.wrap} style={{ '--event-accent': nearestAccent(accent).hex } as React.CSSProperties}>
      <header className={styles.top}>
        {logo && <img className={styles.logo} src={logo} alt="" />}
        <span className={`grow ${styles.name}`}>{data?.snapshot.tournament.name ?? lookup.name}</span>
        {/* "Sin señal" is the phone's connection; "Sin actualizaciones en vivo" is the Realtime channel with a connection. */}
        {!online && !isFixture && <LiveStatus text={pendingHoles > 0 ? t.sync.offlineHoles(pendingHoles) : t.sync.offlineShort} live={false} />}
        {online && realtime === 'live' && <LiveStatus text={t.sync.live} />}
        {online && realtime === 'error' && <LiveStatus text={t.sync.noLive} live={false} />}
        {realtime === 'off' && !isFixture && data && <LiveStatus text={t.sync.fromCache(new Date(updatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))} live={false} />}
      </header>
      <div className={styles.body}>
        {me.via === 'platform' && <PlatformBanner />}
        <Outlet />
      </div>
      <nav className={styles.tabbar} aria-label={t.common.sections}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={`/t/${slug}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.to === ''}
            // Stats and Reglamento live under Más but are their own routes, so
            // without this they used to leave no tab lit at all.
            className={({ isActive }) => `${styles.tab} ${isActive || (tab.to === 'mas' && underMore) ? styles.tabActive : ''}`}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              {tab.icon}
              {tab.to === 'tarjeta' && (rejectedCount > 0 || pendingHoles > 0) && (
                <span className={`${styles.tabBadge} ${rejectedCount > 0 ? styles.tabBadgeBad : ''}`}>{rejectedCount > 0 ? rejectedCount : pendingHoles}</span>
              )}
            </span>
            <span>{tab.label}</span>
            {tab.to === 'tarjeta' && rejectedCount > 0 && <span className="sr-only">, {t.sync.rejected(rejectedCount)}</span>}
            {tab.to === 'tarjeta' && rejectedCount === 0 && pendingHoles > 0 && <span className="sr-only">, {t.sync.pendingHoles(pendingHoles)}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

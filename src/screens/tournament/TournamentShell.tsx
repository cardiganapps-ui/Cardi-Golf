import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { t } from '../../i18n/es-MX'
import { savedWhen } from '../../lib/freshness'
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
  const source = useTournament((s) => s.source)
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
        {!isFixture && <HeaderStatus online={online} source={source} realtime={realtime} updatedAt={updatedAt} pendingHoles={pendingHoles} hasData={!!data} />}
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

/**
 * One line from facts (REL-02): the phone's connection, where the boards came
 * from, and the live channel. «Sin señal» is the phone; «Conectando» is the
 * phone's copy while the live tournament is on its way; «Sin actualizaciones
 * en vivo» is the channel with a connection. It used to read «Sin señal»
 * whenever the channel was off, signal or not.
 */
function HeaderStatus({ online, source, realtime, updatedAt, pendingHoles, hasData }: { online: boolean; source: 'cache' | 'server' | null; realtime: string; updatedAt: number; pendingHoles: number; hasData: boolean }) {
  // The age keeps counting while the phone's copy is up.
  const [, tick] = useState(0)
  useEffect(() => {
    if (source !== 'cache') return
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [source])
  if (!online) {
    if (pendingHoles > 0) return <LiveStatus text={t.sync.offlineHoles(pendingHoles)} live={false} />
    return <LiveStatus text={hasData && source === 'cache' ? t.sync.fromCache(savedWhen(updatedAt)) : t.sync.offlineShort} live={false} />
  }
  if (hasData && source === 'cache') return <LiveStatus text={t.sync.revalidating(savedWhen(updatedAt))} live={false} />
  if (realtime === 'live') return <LiveStatus text={t.sync.live} />
  if (realtime === 'error') return <LiveStatus text={t.sync.noLive} live={false} />
  return null
}

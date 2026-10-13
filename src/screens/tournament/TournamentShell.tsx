import { NavLink, Outlet, useLocation } from 'react-router'
import { t } from '../../i18n/es-MX'
import { savedWhen } from '../../lib/freshness'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import { useBoardsMayBeOld, useSavedWhen } from './boardsAge'
import styles from './TournamentShell.module.css'
import { IconCoin, IconFlag, IconGames, IconMore, IconPencil } from '../../components/icons'
import { LiveStatus } from '../../components/primitives'
import { useOnline, useOwnConnectionStatus } from '../../components/OfflineBanner'
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
  // The few words the frame shows, not the boards: a score saved elsewhere renders no header and no tab bar (PERF-09).
  const tournament = useTournament((s) => s.data?.snapshot.tournament)
  const realtime = useTournament((s) => s.realtime)
  const source = useTournament((s) => s.source)
  const isFixture = useTournament((s) => s.tournamentId?.startsWith('fixture:') ?? false)
  const online = useOnline()
  // The header says «Sin señal» itself, in place: the shell's banner would push every screen down (MOT-17).
  useOwnConnectionStatus()
  const { pathname } = useLocation()
  const underMore = /\/(stats|reglamento|imprimir|ceremonia)$/.test(pathname)
  const accent = tournament?.accentColor ?? lookup.accentColor ?? undefined
  const logo = tournament?.logoUrl ?? lookup.logoUrl
  // Money exists if anyone pays anything: the entry pot, a side pot, a direct
  // bet or the auction. Until the snapshot loads, assume it does, so the bar
  // does not shuffle under a thumb already on its way to a tab.
  const hasMoney = useTournament((st) => {
    const s = st.data?.settings
    return !s || s.entryFee > 0 || s.modules.auction.enabled || s.games.some((g) => g.money.source !== 'none')
  })
  const canScore = !!me.playerId || me.isAdmin
  const tabs = tabsFor({ hasMoney, canScore })
  // Holes still on this phone, and writes the server refused: on the Tarjeta
  // tab from every screen, not only inside the Tarjeta (REL-17).
  const pendingHoles = useOutbox((st) => st.pendingHoles)
  const rejectedCount = useOutbox((st) => st.rejected.length)
  // The boards may be old: the phone's copy, no signal, or a fetch that failed. Say how old (REL-04, REL-10).
  const showAge = useBoardsMayBeOld()
  const fetchFailed = useTournament((st) => st.error != null && !!st.data)

  return (
    <div className={styles.wrap} style={{ '--event-accent': nearestAccent(accent).hex } as React.CSSProperties}>
      <header className={styles.top}>
        <div className={styles.bar}>
          {logo && <img className={styles.logo} src={logo} alt="" />}
          <span className={`grow ${styles.name}`}>{tournament?.name ?? lookup.name}</span>
          {(!isFixture || !online) && <HeaderStatus online={online} source={source} realtime={realtime} fetchFailed={fetchFailed} />}
        </div>
        {showAge && <BoardsAge pendingHoles={online ? 0 : pendingHoles} />}
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
 * The connection in a word or two, from facts (REL-02): the phone's
 * connection, where the boards came from, and the live channel. «Sin señal» is
 * the phone; «Conectando…» is the phone's copy while the live tournament is on
 * its way, or a fetch of the boards that failed while it is tried again
 * (REL-10: it read «En vivo» over minutes-old boards); «Sin actualizaciones en
 * vivo» is the channel with a connection. It used to read «Sin señal»
 * whenever the channel was off, signal or not.
 */
function HeaderStatus({ online, source, realtime, fetchFailed }: { online: boolean; source: 'cache' | 'server' | null; realtime: string; fetchFailed: boolean }) {
  if (!online) return <LiveStatus text={t.sync.offlineShort} live={false} />
  if (source === 'cache' || fetchFailed) return <LiveStatus text={t.sync.connecting} live={false} />
  if (realtime === 'live') return <LiveStatus text={t.sync.live} />
  if (realtime === 'error') return <LiveStatus text={t.sync.noLive} live={false} />
  return null
}

/**
 * How old the boards are, on a second line under the event name (REL-04):
 * the server data's age, which a hole saved on the phone leaves alone; offline,
 * the holes still on the phone too. It used to sit in the chip («Conectando,
 * guardado ayer, 7:49 a.m.»), which cut the event name to «Nach…» at 375 px.
 */
function BoardsAge({ pendingHoles }: { pendingHoles: number }) {
  // The age keeps counting while it shows, and reads the boards' time itself: a reload renders this line, not the shell (PERF-09).
  const updatedAt = useTournament((s) => s.updatedAt)
  const when = useSavedWhen(updatedAt)
  return <p className={styles.boardsAge}>{t.sync.boardsAge(when ?? savedWhen(updatedAt), pendingHoles)}</p>
}

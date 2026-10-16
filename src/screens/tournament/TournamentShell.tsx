import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { t } from '../../i18n/es-MX'
import { savedWhen } from '../../lib/freshness'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './tournamentContext'
import { tournamentBase, useShowMoney } from './tournamentView'
import { useSavedWhen } from './boardsAge'
import { useConnection, useRefreshBoards, type Connection } from './connection'
import { PullToRefresh } from './PullToRefresh'
import { SettingsGuard } from './SettingsGuard'
import styles from './TournamentShell.module.css'
import { IconCoin, IconFlag, IconGames, IconMore, IconPencil } from '../../components/icons'
import { LiveStatus } from '../../components/primitives'
import { TournamentLogo } from '../../components/TournamentLogo'
import { useOwnConnectionStatus } from '../../components/online'
import { nearestAccent } from '../../design/accents'
import { PlatformBanner } from './PlatformBanner'
import { useOutbox } from '../../data/outbox'
import { scrollBehavior } from '../../lib/reducedMotion'
import { GamesScreen, LiveScreen, MoneyScreen, MoreScreen, ScorecardScreen } from '../../app/screens'
import { prefetchScreens, preloadOnIntent } from '../../app/lazyScreen'

/**
 * The tabs a tournament actually has. §9 promises the bar shows only the
 * modules that are on, and it never did: a tournament with no money showed
 * Dinero with nothing in it, and someone watching without a player showed a
 * Tarjeta they cannot write on.
 */
function tabsFor({ hasMoney, canScore, more }: { hasMoney: boolean; canScore: boolean; more: boolean }) {
  return [
    { to: '', label: t.nav.live, icon: <IconFlag />, screen: LiveScreen },
    ...(canScore ? [{ to: 'tarjeta', label: t.nav.card, icon: <IconPencil />, screen: ScorecardScreen }] : []),
    { to: 'juegos', label: t.nav.games, icon: <IconGames />, screen: GamesScreen },
    ...(hasMoney ? [{ to: 'dinero', label: t.nav.money, icon: <IconCoin />, screen: MoneyScreen }] : []),
    // Más is the player's own (his session, the Comité, the join code): a link to watch has none of it.
    ...(more ? [{ to: 'mas', label: t.nav.more, icon: <IconMore />, screen: MoreScreen }] : []),
  ]
}

/** The boards a pull brings again (PWA-15): En vivo, Juegos and Dinero. Never the Tarjeta, whose swipes move between holes. */
const BOARDS = new Set(['', '/juegos', '/dinero'])

/**
 * The tournament frame: a one-line header (event name, connection state)
 * and the tab bar. Everything else belongs to the screens.
 */
export function TournamentShell() {
  const ctx = useTournamentCtx()
  const { lookup, me, spectator } = ctx
  const base = tournamentBase(ctx)
  const showMoney = useShowMoney()
  // The few words the frame shows, not the boards: a score saved elsewhere renders no header and no tab bar (PERF-09).
  const tournament = useTournament((s) => s.data?.snapshot.tournament)
  // The connection, in one place (REL-21): this header. The shell's banner steps aside (MOT-17).
  const connection = useConnection()
  useOwnConnectionStatus()
  const { refreshing, refresh } = useRefreshBoards()
  const { pathname, search, hash } = useLocation()
  const underMore = /\/(stats|reglamento|imprimir|ceremonia)$/.test(pathname)
  const here = pathname.slice(base.length).replace(/\/$/, '')
  const onBoard = BOARDS.has(here)
  const accent = tournament?.accentColor ?? lookup.accentColor ?? undefined
  const logo = tournament?.logoUrl ?? lookup.logoUrl
  // Money exists if anyone pays anything: the entry pot, a side pot, a direct
  // bet or the auction. Until the snapshot loads, assume it does, so the bar
  // does not shuffle under a thumb already on its way to a tab.
  const hasMoney = useTournament((st) => {
    const s = st.data?.settings
    return !s || s.entryFee > 0 || s.modules.auction.enabled || s.games.some((g) => g.money.source !== 'none')
  })
  const canScore = !!me.playerId || me.isComite
  const tabs = tabsFor({ hasMoney: hasMoney && showMoney, canScore, more: !spectator })
  // Holes still on this phone, and writes the server refused: on the Tarjeta
  // tab from every screen, not only inside the Tarjeta (REL-17).
  const pendingHoles = useOutbox((st) => st.pendingHoles)
  const rejectedCount = useOutbox((st) => st.rejected.length)
  // Each tab's screen loads while the page is idle, so a tap swaps it in its own frame (MOT-22, PERF-02). Never
  // on the Tarjeta: its taps are the ones that must land at once, and a tab there loads on the first touch.
  const tabScreens = tabs.map((tab) => tab.screen)
  const tabKey = tabs.map((tab) => tab.to).join()
  const onCard = here === '/tarjeta'
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the tabs, by which ones they are
  useEffect(() => (onCard ? undefined : prefetchScreens(tabScreens)), [tabKey, onCard])

  return (
    <div className={styles.wrap} style={{ '--event-accent': nearestAccent(accent).hex } as React.CSSProperties}>
      <header className={styles.top}>
        <div className={styles.bar}>
          {logo && <TournamentLogo className={styles.logo} url={logo} />}
          <span className={`grow ${styles.name}`}>{tournament?.name ?? lookup.name}</span>
          {connection && <ConnectionChip connection={connection} refreshing={refreshing} onRefresh={refresh} />}
        </div>
        {/* The boards may be old: the phone's copy, no signal, or a fetch that failed. Say how old (REL-04, REL-10). */}
        {connection?.mayBeOld && <BoardsAge />}
      </header>
      <div className={styles.body}>
        <PullToRefresh enabled={onBoard} refreshing={refreshing} onRefresh={refresh}>
          {me.via === 'platform' && <PlatformBanner />}
          {/* Settings this build can't read (ARCH-04): every screen but Más says to update instead of computing the defaults. */}
          {here === '/mas' ? <Outlet /> : <SettingsGuard money={here === '/dinero'}><Outlet /></SettingsGuard>}
        </PullToRefresh>
      </div>
      <nav className={styles.tabbar} aria-label={t.common.sections}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={`${base}${tab.to ? `/${tab.to}` : ''}`}
            end={tab.to === ''}
            {...preloadOnIntent(tab.screen)}
            // The open tab, tapped again, takes its screen back to the top (MOT-16, the phones' own convention). A view
            // inside it (the Tarjeta's grid, a hole a notice opened) is left by the tap as before.
            onClick={(e) => {
              const to = `${base}${tab.to ? `/${tab.to}` : ''}`
              if (search || hash || pathname.replace(/\/+$/, '') !== to.replace(/\/+$/, '')) return
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: scrollBehavior() })
            }}
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
 * The connection in a word or two (REL-02, REL-21): «Sin señal» is the
 * phone; «Conectando…» is signal without live boards yet (the phone's copy,
 * a fetch tried again, the live channel joining or joining again); «En vivo»
 * is the server's boards with the channel up. It used to read «En vivo» over
 * minutes-old boards (REL-10), nothing while the channel joined, and «Sin
 * actualizaciones en vivo» while it was down. Anything but live is a button,
 * «Actualizar» (PWA-15): the installed app has no reload of its own.
 */
function ConnectionChip({ connection, refreshing, onRefresh }: { connection: Connection; refreshing: boolean; onRefresh: () => Promise<void> }) {
  const live = connection.kind === 'live'
  const said = live ? t.sync.live : connection.kind === 'offline' ? t.sync.offlineShort : t.sync.connecting
  // A pull while live says it too: the chip is where the boards' state is read, by eye and by a screen reader.
  if (live) return <LiveStatus text={refreshing ? t.sync.refreshing : said} />
  return (
    <LiveStatus
      text={refreshing ? t.sync.refreshing : said}
      live={false}
      busy={refreshing}
      label={refreshing ? t.sync.refreshing : t.sync.refreshLabel(said)}
      onRefresh={() => void onRefresh()}
    />
  )
}

/**
 * How old the boards are, on a second line under the event name (REL-04):
 * the server data's age, which a hole saved on the phone leaves alone. It
 * used to sit in the chip («Conectando, guardado ayer, 7:49 a.m.»), which cut
 * the event name to «Nach…» at 375 px, and offline it also counted the holes
 * on the phone, which the Tarjeta's tab and its line already say (REL-21).
 */
function BoardsAge() {
  // The age keeps counting while it shows, and reads the boards' time itself: a reload renders this line, not the shell (PERF-09).
  const updatedAt = useTournament((s) => s.updatedAt)
  const when = useSavedWhen(updatedAt)
  return <p className={styles.boardsAge}>{t.sync.boardsAge(when ?? savedWhen(updatedAt))}</p>
}

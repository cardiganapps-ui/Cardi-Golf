import { NavLink, Outlet } from 'react-router'
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import styles from './TournamentShell.module.css'
import { IconCoin, IconFlag, IconGames, IconMore, IconPencil } from '../../components/icons'
import { nearestAccent } from '../../design/accents'

const TABS = [
  { to: '', label: t.nav.live, icon: <IconFlag /> },
  { to: 'tarjeta', label: t.nav.card, icon: <IconPencil /> },
  { to: 'juegos', label: t.nav.games, icon: <IconGames /> },
  { to: 'dinero', label: t.nav.money, icon: <IconCoin /> },
  { to: 'mas', label: t.nav.more, icon: <IconMore /> },
]

export function TournamentShell() {
  const { slug, lookup } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const realtime = useTournament((s) => s.realtime)
  const accent = data?.snapshot.tournament.accentColor ?? lookup.accentColor ?? undefined
  const status = data?.snapshot.tournament.status ?? lookup.status

  return (
    <div className={styles.wrap} style={{ '--event-accent': nearestAccent(accent).hex } as React.CSSProperties}>
      <header className={styles.top}>
        {(data?.snapshot.tournament.logoUrl ?? lookup.logoUrl) && <img className={styles.logo} src={data?.snapshot.tournament.logoUrl ?? lookup.logoUrl ?? ''} alt="" />}
        <div className="grow">
          <strong className={styles.name}>{data?.snapshot.tournament.name ?? lookup.name}</strong>
          <span className="help" style={{ display: 'block' }}>
            {t.status[status as keyof typeof t.status] ?? status}
          </span>
        </div>
        <span className={`chip ${styles.sync} ${realtime === 'live' ? 'chip--teal' : realtime === 'error' ? 'chip--coral' : ''}`} title={realtime === 'error' ? t.sync.offline : realtime}>
          {realtime === 'live' ? t.sync.live : realtime === 'error' ? t.sync.offlineShort : t.sync.connecting}
        </span>
      </header>
      <div className={styles.body}>
        <Outlet />
      </div>
      <nav className={styles.tabbar} aria-label={t.common.sections}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={`/t/${slug}${tab.to ? `/${tab.to}` : ''}`} end={tab.to === ''} className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
            <span className={styles.tabIcon} aria-hidden="true">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

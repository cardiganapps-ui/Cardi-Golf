import { NavLink, Outlet } from 'react-router'
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import styles from './TournamentShell.module.css'

const TABS = [
  { to: '', label: t.nav.live, icon: '⛳️' },
  { to: 'tarjeta', label: t.nav.card, icon: '✏️' },
  { to: 'juegos', label: t.nav.games, icon: '🐍' },
  { to: 'dinero', label: t.nav.money, icon: '💸' },
  { to: 'mas', label: t.nav.more, icon: '•••' },
]

export function TournamentShell() {
  const { slug, lookup } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const realtime = useTournament((s) => s.realtime)
  const accent = data?.snapshot.tournament.accentColor ?? lookup.accentColor ?? undefined
  const status = data?.snapshot.tournament.status ?? lookup.status

  return (
    <div className={styles.wrap} style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}>
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
      <nav className={styles.tabbar} aria-label="Secciones">
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

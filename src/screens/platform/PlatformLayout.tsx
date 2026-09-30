/**
 * `/admin`: the Polo platform admin. The frame is the Comité's (same
 * stylesheet), grouped the way Cardigan's admin is: what's happening, what
 * the platform holds, how it runs. Sections that arrive in later slices are
 * listed so the shape is visible, but say so instead of pretending.
 */
import { Link, NavLink, Outlet } from 'react-router'
import { t } from '../../i18n/es-MX'
import a from '../admin/AdminLayout.module.css'
import s from './Platform.module.css'

const P = t.platform

/** The sections, grouped. `ready: false` ones arrive in a later slice. */
const PLATFORM_SECTIONS: Array<{ group: string; items: Array<{ to: string; label: string; ready: boolean }> }> = [
  {
    group: P.groups.overview,
    items: [
      { to: 'resumen', label: P.sections.overview, ready: true },
      { to: 'torneos', label: P.sections.tournaments, ready: true },
      { to: 'personas', label: P.sections.people, ready: false },
    ],
  },
  {
    group: P.groups.catalog,
    items: [
      { to: 'campos', label: P.sections.courses, ready: false },
      { to: 'crews', label: P.sections.crews, ready: false },
    ],
  },
  {
    group: P.groups.ops,
    items: [
      { to: 'avisos', label: P.sections.notices, ready: false },
      { to: 'auditoria', label: P.sections.audit, ready: false },
      { to: 'salud', label: P.sections.health, ready: false },
    ],
  },
]

export function PlatformLayout() {
  return (
    <div className={a.layout}>
      <div className={a.head}>
        <div className={a.headText}>
          <span className="label">Polo</span>
          <h1>{P.title}</h1>
        </div>
        <Link className="btn btn--secondary btn--sm" to="/">
          {P.backHome}
        </Link>
      </div>
      <div className={a.body}>
        <nav className={a.nav} aria-label={P.sectionsLabel}>
          {PLATFORM_SECTIONS.map((g) => [
            <span key={g.group} className={s.groupLabel}>
              {g.group}
            </span>,
            ...g.items.map((it) => (
              <NavLink key={it.to} to={it.to} className={({ isActive }) => `${a.navItem} ${isActive ? a.navActive : ''} ${it.ready ? '' : s.navSoon}`}>
                {it.label}
              </NavLink>
            )),
          ])}
        </nav>
        <div className={a.content}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** A section from a later slice. */
export function SoonScreen({ title }: { title: string }) {
  return (
    <div className={s.screen}>
      <h2>{title}</h2>
      <p className={s.help}>{P.soon}</p>
    </div>
  )
}

/**
 * Every screen's name, for the document title and for a screen reader when the
 * page changes (A11Y-13). Every screen used to be «Polo»: the app switcher, the
 * history and a screen reader said the same for each.
 *
 * The name comes from the address (`routeTitle`), with the tournament's name
 * after it inside a tournament («Tarjeta, Nacho's Bachelor Invitational»). A
 * screen the address can't tell apart (Entrar before the PIN, under the same
 * address as En vivo; the page that doesn't exist) says its own name with
 * `usePageTitle`, which wins while it is mounted.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { t } from '../i18n/es-MX'

const T = t.titles

/** The page's name from its address: what it is, and the tournament's slug when it is inside one (`_/<fixture>` for the fixtures). */
export function routeTitle(pathname: string): { page: string; slug: string | null } {
  const path = pathname.replace(/\/+$/, '') || '/'
  const tm = /^\/t\/(_\/[^/]+|[^/]+)(?:\/(.*))?$/.exec(path)
  if (tm) return { page: tournamentPage(tm[2] ?? ''), slug: tm[1]! }
  // The example tournament (STRAT-17): its screens by name, after «Torneo de ejemplo».
  const dm = /^\/demo(?:\/(.*))?$/.exec(path)
  if (dm) return { page: T.inTournament(tournamentPage(dm[1] ?? ''), T.demo), slug: null }
  const am = /^\/admin(?:\/_)?(?:\/([^/]+))?/.exec(path)
  if (am) {
    const section = (am[1] && (t.platform.sections as Record<string, string>)[PLATFORM_KEYS[am[1]] ?? '']) || null
    return { page: section ? T.section(t.platform.title, section) : t.platform.title, slug: null }
  }
  for (const [re, page] of PAGES) if (re.test(path)) return { page, slug: null }
  return { page: t.app.name, slug: null }
}

/** Inside a tournament, by what follows its slug. */
function tournamentPage(rest: string): string {
  const [first, second] = rest.split('/')
  switch (first) {
    case '':
    case undefined:
      return t.nav.live
    case 'tarjeta':
      return t.nav.card
    case 'juegos':
      return t.nav.games
    case 'dinero':
      return t.nav.money
    case 'stats':
      return t.stats.title
    case 'reglamento':
      return t.rules.title
    case 'mas':
      return t.more.title
    case 'tv':
      return t.tv.title
    case 'ceremonia':
      return t.ceremony.title
    case 'imprimir':
      return T.print
    case 'admin': {
      const section = second && (t.admin.sections as Record<string, string>)[ADMIN_KEYS[second] ?? '']
      return section ? T.section(t.admin.title, section) : t.admin.title
    }
    default:
      return t.app.name
  }
}

/** The Comité's paths and their names in `t.admin.sections`. */
const ADMIN_KEYS: Record<string, string> = {
  torneo: 'tournament',
  jugadores: 'players',
  campos: 'courses',
  rondas: 'rounds',
  grupos: 'groups',
  handicaps: 'handicaps',
  scores: 'scores',
  calcutta: 'auction',
  parejas: 'draw',
  equipos: 'teams',
  juegos: 'games',
  historial: 'history',
  datos: 'data',
}
/** The Admin de Polo's paths and their names in `t.platform.sections`. */
const PLATFORM_KEYS: Record<string, string> = {
  resumen: 'overview',
  torneos: 'tournaments',
  personas: 'people',
  campos: 'courses',
  crews: 'crews',
  avisos: 'notices',
  auditoria: 'audit',
  salud: 'health',
}

/** Everything outside a tournament and the admin, first match wins (the fixtures' `/_` paths read as the real ones). */
const PAGES: Array<[RegExp, string]> = [
  [/^\/$/, T.home],
  [/^\/continuar(\/|$)/, T.opening],
  [/^\/organizer\/login$/, T.organizerLogin],
  [/^\/organizer\/reset$/, T.newPassword],
  [/^\/organizer\/(new|nuevo\/_)$/, T.newTournament],
  [/^\/organizer$/, T.myTournaments],
  [/^\/entrar$/, T.account],
  [/^\/privacidad$/, t.legal.privacy.title],
  [/^\/terminos$/, t.legal.terms.title],
  [/^\/perfil\/vuelta$/, T.account],
  [/^\/perfil\/editar$/, T.editProfile],
  [/^\/amigos(\/_)?$/, T.friends],
  [/^\/avisos(\/_)?$/, T.inbox],
  [/^\/ronda(\/_)?$/, t.quick.title],
  [/^\/campos$/, t.courses.title],
  [/^\/crews$/, t.crews.title],
  [/^\/c\/unirme\//, T.joinCrew],
  [/^\/c\/[^/]+$/, T.crew],
  [/^\/p\/(_\/)?[^/]+\/vs$/, T.versus],
  [/^\/p\/_\/[^/]+\/anio$/, T.year],
  [/^\/p\/(_\/)?[^/]+$/, T.profile],
  [/^\/tv$/, t.tv.title],
  [/^\/fixture$/, T.fixtures],
  [/^\/design$/, T.design],
]

// ---- A screen's own name, while it is mounted ----

let override: string | null = null
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const read = () => override

/** This screen's name, over the one its address gives, while it is mounted. */
export function usePageTitle(title: string) {
  useEffect(() => {
    override = title
    listeners.forEach((fn) => fn())
    return () => {
      if (override === title) override = null
      listeners.forEach((fn) => fn())
    }
  }, [title])
}

/** The name a screen gave itself, if any. */
export function usePageTitleOverride(): string | null {
  return useSyncExternalStore(subscribe, read, read)
}

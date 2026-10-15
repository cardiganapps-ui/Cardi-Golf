/**
 * Where a page keeps its scroll (MOT-16). Nothing kept one: the window's scroll carried over from page to page, so
 * from a scrolled En vivo the Dinero tab opened at its bottom, its title and the bank's summary above the fold.
 *
 * Inside a tournament (`/t/<slug>/…`, a link to watch `/v/<token>/…`, their fixtures) every screen is a tab or a
 * Comité section the person moves between and comes back to: each keeps its own scroll by its path, so En vivo
 * comes back where it was left and a screen opened for the first time starts at its top. Everywhere else a page's
 * scroll belongs to its history entry, as a browser keeps it: back returns to it, a new visit starts at the top.
 * React Router's ScrollRestoration (AppShell) keeps them for the visit, in this tab's sessionStorage, so a link's
 * token never goes in a key (STRAT-05: telemetry names that route `/v/:token` too).
 */
export function scrollKey(location: { pathname: string; key: string }): string {
  const path = location.pathname.replace(/\/+$/, '')
  if (/^\/v\/[^/]+/.test(path)) return path.replace(/^\/v\/[^/]+/, '/v/:token')
  if (/^\/t\/[^/]+/.test(path)) return path
  return location.key
}

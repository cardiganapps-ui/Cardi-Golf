// @vitest-environment happy-dom
/**
 * STRAT-05, round 2: a link page is whatever address the router opens one at.
 * The router matches without regard to case, with a trailing slash and on the
 * decoded path; a check of its own read `/V/<token>` as no link, so the page
 * started the outbox and telemetry (whose route carried the token). Held here
 * to the app's real routes, address by address.
 */
import { matchRoutes, type RouteObject } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
const { router } = await import('../app/router')
const { SpectatorGate } = await import('../app/screens')
const { isLinkPage } = await import('./linkPage')

/** The design fixtures' links to watch (src/app/devRoutes.tsx), with and without money. */
const FIXTURE_LINKS = new Set(['v/_/:name', 'v/_dinero/:name'])

/** Whether the app's router opens a link to watch at `path`: the gate, inside its lazy boundary (PERF-02), or a fixture's. */
const routerOpensLink = (path: string) =>
  !!matchRoutes(router.routes as RouteObject[], path)?.some((m) => {
    const el = m.route.element as { props?: { children?: { type?: unknown } } } | undefined
    return el?.props?.children?.type === SpectatorGate || FIXTURE_LINKS.has(m.route.path ?? '')
  })

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv12'
const PATHS = [
  `/v/${TOKEN}`,
  `/V/${TOKEN}`,
  `/v/${TOKEN}/`,
  `/V/${TOKEN}/TV`,
  `/v/${TOKEN}/juegos`,
  `/v/${TOKEN}/dinero/`,
  `/%76/${TOKEN}`,
  `/%56/${TOKEN}/tv`,
  '/v/_/full12-live',
  '/V/_DINERO/full12-live/dinero',
  // Not links.
  '/',
  '/v',
  '/v/',
  '/vx/abc',
  `/t/${TOKEN}`,
  `/t/nacho/v/${TOKEN}`,
  `//v/${TOKEN}`,
]

describe('a link page is what the router opens as one (STRAT-05)', () => {
  for (const path of PATHS) {
    it(path, () => {
      expect(isLinkPage(path)).toBe(routerOpensLink(path))
    })
  }

  it('the router does open the upper-case, trailing-slash and encoded addresses: the check matters', () => {
    for (const path of [`/V/${TOKEN}`, `/v/${TOKEN}/`, `/%76/${TOKEN}`]) expect(routerOpensLink(path), path).toBe(true)
    for (const path of ['/v', '/v/', '/vx/abc', `/t/${TOKEN}`]) expect(routerOpensLink(path), path).toBe(false)
  })
})

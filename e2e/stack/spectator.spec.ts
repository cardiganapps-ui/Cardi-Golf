/**
 * STRAT-05 on the real stack: a link to watch, opened by a browser that has
 * never been here, as the villa's TV or a partner's phone opens it. The boards
 * come from `spectator_board` through the API as the anon role; nothing signs
 * in, no live channel opens, and no other request leaves the page. A hole a
 * player's phone saves shows at the next ask (every 20 s on a day in play),
 * with no peso on the page «Sin dinero». Switched off, the next ask says the
 * link no longer works and the boards go. The SQL harness can call the
 * function as anon; only the stack proves the gateway lets the anon key
 * through and the page reads the answer.
 */
import { t } from '../../src/i18n/es-MX'
import { lit, sql } from './env'
import { HOLE_1, SLUGS } from './field'
import { boardAfter, boardRows, expect, openCard, PHONE, saveHole, test, typeHole } from './phone'

/** How often the page asks on a day in play (src/data/spectator.ts `POLL.live`). */
const POLL_MS = 20_000

/** Every amount in pesos the page shows. */
const pesos = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.body.innerText.match(/\$\s?[\d,.]+/g) ?? [])

test('a link to watch: no session, the boards «Sin dinero», a hole a phone saved at the next ask, and switched off at the next one', async ({
  browser,
  join,
}) => {
  test.setTimeout(180_000)
  // The Comité's link, as save_spectator_link makes it (the Comité's card and the function are tested on their own).
  const token = sql<string>(`insert into public.spectator_links (tournament_id, token, money)
    select id, public.new_spectator_token(), false from public.tournaments where slug = ${lit(SLUGS.spectator)} returning to_json(token)`)
  expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/)

  // A browser with no session and nothing stored: what it asks, and whether anything signs in or listens.
  const context = await browser.newContext(PHONE)
  const rest: string[] = []
  /** Each REST request's bearer against its key: a link asks as anon, with no session (`anonRpc`). */
  const bearers: Array<[string | undefined, string | undefined]> = []
  let auth = 0
  let sockets = 0
  context.on('request', (r) => {
    const path = new URL(r.url()).pathname
    const at = path.indexOf('/rest/v1/')
    if (at >= 0) {
      rest.push(path.slice(at + '/rest/v1/'.length))
      const h = r.headers()
      bearers.push([h.authorization, h.apikey])
    }
    if (path.includes('/auth/v1/')) auth++
  })
  const viewer = await context.newPage()
  const errors: string[] = []
  viewer.on('pageerror', (e) => errors.push(e.message))
  viewer.on('websocket', () => sockets++)
  await viewer.goto(`/v/${token}`)
  await expect(viewer.getByText(t.spectator.note)).toBeVisible({ timeout: 30_000 })
  await expect(viewer.getByRole('navigation', { name: t.common.sections }).getByRole('link')).toHaveText([
    t.nav.live,
    t.nav.games,
  ])

  // Ana's phone saves hole 1 for her foursome.
  const ana = await join(SLUGS.spectator, 'Ana')
  await openCard(ana.page)
  await typeHole(ana.page, 1, HOLE_1)
  await saveHole(ana.page, 1)
  await expect
    .poll(() =>
      sql<number>(
        `select count(*)::int from public.scores s join public.tournaments t on t.id = s.tournament_id where t.slug = ${lit(SLUGS.spectator)} and s.hole = 1`,
      ),
    )
    .toBe(4)
  const savedAt = Date.now()

  // The link shows it at its next ask, as the board works it out.
  const want = boardAfter(new Map([[1, HOLE_1]]), 1)
  await expect
    .poll(
      async () => {
        const labels = await boardRows(viewer)
        return want.every((w) => labels.some((l) => l === w || l.endsWith(`, ${w}`)))
      },
      { timeout: POLL_MS + 10_000, intervals: [500] },
    )
    .toBe(true)
  console.log(
    `[e2e-stack] link to watch: hole 1 saved → shown on the link in ${Date.now() - savedAt} ms (asks every ${POLL_MS} ms)`,
  )
  expect(await pesos(viewer), 'a link «Sin dinero» shows no peso').toEqual([])
  // It keeps nothing of its own on the phone: no outbox database, no key in storage (no telemetry device id or queue).
  const kept = await viewer.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((d) => d.name),
    keys: Object.keys(localStorage).filter((k) => k.startsWith('cardi-golf')),
  }))
  expect(kept).toEqual({ databases: [], keys: [] })

  // «Apagar»: the next ask (coming back to the page asks at once) says so, and the boards go.
  const off = sql<number>(
    `with d as (delete from public.spectator_links where tournament_id = (select id from public.tournaments where slug = ${lit(SLUGS.spectator)}) returning 1) select count(*)::int from d`,
  )
  expect(off).toBe(1)
  await viewer.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(viewer.getByText(t.spectator.gone)).toBeVisible({ timeout: 15_000 })
  await expect(viewer.locator('button[class*="leaderRow"]')).toHaveCount(0)

  // Nothing signed in, nothing listened, and the page asked for the boards and the app's switches only.
  expect(auth, 'requests to /auth/v1/ (a sign-in, a new anonymous user)').toBe(0)
  expect(sockets, 'live channels opened').toBe(0)
  expect(rest).toContain('rpc/spectator_board')
  expect(
    bearers.every(([bearer, key]) => !!key && bearer === `Bearer ${key}`),
    'every request as anon',
  ).toBe(true)
  expect(
    [...new Set(rest)].filter((p) => p !== 'rpc/spectator_board' && p !== 'rpc/app_flags'),
    'other requests',
  ).toEqual([])
  expect(errors).toEqual([])
  await context.close()
})

/**
 * A session that lapses in a dead zone keeps its holes and its player (REL-16).
 *
 * Ana's phone saves two holes with no signal while its token runs out. The
 * signal comes back but Auth cannot refresh the token yet (every refresh
 * answers 503), and the player closes and reopens the app on the Tarjeta:
 * it opens from the phone's own copy and saves a third hole there. auth-js
 * tries the refresh 8 times over ~25 s, then holds that failure for 60 s, so
 * for a minute the app asks for a session and gets none: the moment it used
 * to sign in as a new anonymous user, whose writes the server then refused.
 * Here it must not: once Auth answers, the same user's session comes back and
 * all three holes reach the server, with no PIN typed again.
 */
import { t } from '../../src/i18n/es-MX'
import { lit, sql } from './env'
import { HOLE_1, ROUND, SLUGS, type HoleEntry } from './field'
import { expect, expectedScores, openCard, openPage, saveHole, serverScores, storedSession, test, typeHole } from './phone'

const REFRESH = /\/auth\/v1\/token\?grant_type=refresh_token/

test('a lapsed session keeps its queued holes and its player: no new anonymous user', async ({ join }) => {
  test.setTimeout(300_000)
  const ana = await join(SLUGS.session, 'Ana')
  const uid = (await storedSession(ana.page))?.user?.id
  expect(uid, 'the phone has a session').toBeTruthy()
  expect(ana.signUps, 'the one anonymous sign-in that opened the link').toBe(1)
  await openCard(ana.page)

  // In the dead zone: two holes saved on the phone, and the token runs out.
  await ana.context.setOffline(true)
  await typeHole(ana.page, 1, HOLE_1)
  await saveHole(ana.page, 1)
  await typeHole(ana.page, 2, ROUND[1]!)
  await saveHole(ana.page, 2)
  await ana.page.evaluate(() => {
    const key = 'cardi-golf-auth'
    const session = JSON.parse(localStorage.getItem(key)!) as { expires_at: number }
    session.expires_at = Math.floor(Date.now() / 1000) - 120
    localStorage.setItem(key, JSON.stringify(session))
  })

  // The signal returns, Auth does not answer yet, and the player reopens the app.
  let refused = 0
  await ana.context.route(REFRESH, (route) => {
    refused++
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"e2e-stack: Auth unavailable"}' })
  })
  await ana.page.close()
  await ana.context.setOffline(false)
  refused = 0
  const page = await openPage(ana, `/t/${SLUGS.session}/tarjeta`)

  // From the phone's own copy: holes 1 and 2 are on it, hole 3 is next, and it saves.
  await typeHole(page, 3, ROUND[2]!)
  await saveHole(page, 3)

  // auth-js gives up after its 8th try and holds the failure: from here on the app gets no session.
  await expect.poll(() => refused, { timeout: 60_000, message: 'auth-js refresh attempts while Auth was down' }).toBeGreaterThanOrEqual(8)
  expect(serverScores(SLUGS.session), 'nothing went out without a session').toEqual([])

  // Auth answers again. Within its cooldown and the gate's next ask, the same session returns and the holes go out.
  await ana.context.unroute(REFRESH)
  const card = new Map<number, HoleEntry>([
    [1, HOLE_1],
    [2, ROUND[1]!],
    [3, ROUND[2]!],
  ])
  await expect.poll(() => serverScores(SLUGS.session), { timeout: 180_000, intervals: [2000] }).toEqual(expectedScores(card, 'Ana'))

  // Still Ana's phone: the same user, a fresh token, no other anonymous sign-in, and no PIN asked for.
  const after = await storedSession(page)
  expect(after?.user?.id).toBe(uid)
  expect(after?.expires_at ?? 0).toBeGreaterThan(Date.now() / 1000)
  expect(ana.signUps, 'anonymous sign-ins on this phone').toBe(1)
  expect(
    sql<string[]>(`select coalesce(json_agg(d.auth_user_id), '[]') from public.device_sessions d join public.players p on p.id = d.player_id
      join public.tournaments t on t.id = p.tournament_id where t.slug = ${lit(SLUGS.session)}`),
  ).toEqual([uid])
  await expect(page.getByText(t.enter.tapYourFace)).toHaveCount(0)
  await expect(page.getByText(t.sync.synced, { exact: true })).toBeVisible({ timeout: 30_000 })
})

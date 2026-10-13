/**
 * TRUST-24 on the real stack: a PIN's claim keeps the kind of phone, read by
 * the database from the request's own user agent as PostgREST hands it over.
 * The SQL harness can only fake that header. These phones are Chromium on
 * Linux, so each claim reads «desktop»; a missing header would read «other».
 * A second phone with the same PIN is a second claim of the player, and the
 * history keeps which phone wrote each hole, so Historial can tell them apart.
 */
import { lit, sql } from './env'
import { HOLE_1, SLUGS } from './field'
import { expect, openCard, saveHole, storedSession, test, typeHole } from './phone'

/** The open claims of a player of the phones' tournament, in the order they began. */
const claims = (name: string) =>
  sql<string[]>(`select coalesce(json_agg(c.platform order by c.claimed_at, c.id), '[]') from public.pin_claims c
    join public.players p on p.id = c.player_id join public.tournaments t on t.id = p.tournament_id
    where t.slug = ${lit(SLUGS.phones)} and p.display_name = ${lit(name)} and c.released_at is null`)

test('two phones with Ana’s PIN are two claims of hers, each its kind from the request, and the history names the phone that wrote', async ({ join }) => {
  const first = await join(SLUGS.phones, 'Ana')
  expect(claims('Ana'), 'the PIN typed on the first phone, read as the computer Chromium says it is').toEqual(['desktop'])
  const second = await join(SLUGS.phones, 'Ana')
  expect(claims('Ana'), 'a second phone with her PIN is a second claim').toEqual(['desktop', 'desktop'])
  const uid = (await storedSession(second.page))?.user?.id
  expect(uid, 'the second phone has its own user').toBeTruthy()
  expect(uid).not.toBe((await storedSession(first.page))?.user?.id)

  // The second phone saves hole 1: its write is in the history under its own user, which is what Historial numbers.
  await openCard(second.page)
  await typeHole(second.page, 1, HOLE_1)
  await saveHole(second.page, 1)
  await expect
    .poll(() =>
      sql<number>(`select count(*)::int from public.audit_log a join public.tournaments t on t.id = a.tournament_id
        where t.slug = ${lit(SLUGS.phones)} and a.table_name = 'scores' and a.actor_auth_user_id = ${lit(uid!)}::uuid`),
    )
    .toBeGreaterThan(0)
})

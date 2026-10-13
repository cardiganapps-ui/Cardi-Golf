/**
 * DB-05: a phone hears its own tournament's changes and no other's, deletes
 * included. Each binding of the live channel is filtered by tournament
 * (src/data/realtimeTables.ts), and the tables log their whole old row
 * (0049), so the server can read a delete's tournament too.
 *
 * One phone in e2e-propio. The database writes a score, changes it and
 * deletes it, in e2e-ajeno and in e2e-propio, step by step. The phone's socket
 * must carry all three of its own tournament's changes and none of the
 * other's. Without the filter the other's delete arrives (RLS cannot check a
 * delete, so it reached every phone listening); without 0049 the phone's own
 * delete never does.
 */
import type { WebSocket } from '@playwright/test'
import { lit, sql } from './env'
import { SLUGS } from './field'
import { expect, expectLive, test } from './phone'

interface Heard {
  table: string
  type: string
  id: string | null
}

/** A Realtime frame's postgres change, as the socket carried it (either of realtime-js's serializers), or null. */
function heard(frame: string): Heard | null {
  let msg: unknown
  try {
    msg = JSON.parse(frame)
  } catch {
    return null
  }
  const [event, payload] = Array.isArray(msg) ? [msg[3], msg[4]] : [(msg as { event?: unknown }).event, (msg as { payload?: unknown }).payload]
  if (event !== 'postgres_changes') return null
  const data = (payload as { data?: { table?: string; type?: string; record?: { id?: string }; old_record?: { id?: string } } } | undefined)?.data
  if (!data?.table || !data.type) return null
  return { table: data.table, type: data.type, id: data.record?.id ?? data.old_record?.id ?? null }
}

/** One score for Hugo (group 2, nobody's card here) on hole 18 of the tournament's live day. Returns its id. */
function write(slug: string): string {
  return sql<{ id: string }>(`
    with p as (
      select pl.id as player_id, r.id as round_id
      from public.players pl
      join public.tournaments t on t.id = pl.tournament_id
      join public.rounds r on r.tournament_id = t.id and r.status = 'live'
      where t.slug = ${lit(slug)} and pl.display_name = 'Hugo'
    ), ins as (
      insert into public.scores (round_id, player_id, hole, strokes, putts, picked_up)
      select round_id, player_id, 18, 5, 2, false from p
      returning id
    )
    select json_build_object('id', id) from ins`).id
}
const change = (id: string) => sql(`with u as (update public.scores set strokes = 6 where id = ${lit(id)} returning 1) select to_json(count(*)) from u`)
const remove = (id: string) => sql(`with d as (delete from public.scores where id = ${lit(id)} returning 1) select to_json(count(*)) from d`)

test('a phone hears its own tournament’s changes, a delete included, and nothing of another’s (DB-05)', async ({ join }) => {
  const ana = await join(SLUGS.own, 'Ana')
  // The app again, its socket watched from the start: the PIN's session stays on the phone.
  await ana.page.close()
  const page = await ana.context.newPage()
  page.on('pageerror', (e) => ana.errors.push(`${ana.name}: ${e.message}`))
  const frames: Heard[] = []
  page.on('websocket', (ws: WebSocket) =>
    ws.on('framereceived', (f) => {
      const h = heard(typeof f.payload === 'string' ? f.payload : f.payload.toString('utf8'))
      if (h) frames.push(h)
    }),
  )
  ana.page = page
  await page.goto(`/t/${SLUGS.own}`)
  await expectLive(page)

  // Each step in the other tournament first: had the server meant to send its change, it would land before the
  // phone's own. And each waits for the phone's own change: Realtime checks an insert or an update against the
  // row as it stands, so a row deleted before it got there is not sent.
  const of = (id: string) => frames.filter((h) => h.table === 'scores' && h.id === id).map((h) => h.type)
  const heardOwn = (types: string[], what: string) => expect.poll(() => of(mine), { message: `the phone’s own tournament: ${what}`, timeout: 15_000 }).toEqual(types)
  const theirs = write(SLUGS.other)
  const mine = write(SLUGS.own)
  await heardOwn(['INSERT'], 'written')
  change(theirs)
  change(mine)
  await heardOwn(['INSERT', 'UPDATE'], 'changed')
  remove(theirs)
  remove(mine)
  await heardOwn(['INSERT', 'UPDATE', 'DELETE'], 'deleted')
  // A moment more for anything still on its way.
  await page.waitForTimeout(1_000)
  expect(of(theirs), 'another tournament’s changes reached this phone').toEqual([])
})

/**
 * Before any stack test: refuse anything but the local stack, seed the
 * throwaway tournaments again (seed.sql), and check that the field the tests
 * expect (field.ts) is the one the database now holds, so a drift between the
 * two fails here and not as a puzzling board three specs later.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertLocal, DB_URL, sql } from './env'
import { CARD, PLAYERS, SLUGS } from './field'

interface Seeded {
  slug: string
  tournament: string
  round: string
  players: Array<{ name: string; fullName: string; base: number; group: number; pin: boolean }>
  holes: Array<[number, number]>
}

export default function globalSetup() {
  assertLocal()
  execFileSync('psql', [DB_URL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL('seed.sql', import.meta.url))], { stdio: 'inherit' })

  const seeded = sql<Seeded[]>(`
    select coalesce(json_agg(x order by x.slug), '[]') from (
      select t.slug, t.status as tournament,
        (select string_agg(r.status, ',') from public.rounds r where r.tournament_id = t.id) as round,
        (select json_agg(json_build_object('name', p.display_name, 'fullName', p.full_name, 'base', p.base_hcp, 'group', g.number,
            'pin', exists (select 1 from public.player_pins pp where pp.player_id = p.id)) order by p.sort_order)
          from public.players p
          join public.group_members m on m.player_id = p.id
          join public.groups g on g.id = m.group_id
          where p.tournament_id = t.id) as players,
        (select json_agg(json_build_array(h.par, h.stroke_index) order by h.number)
          from public.rounds r join public.tees te on te.course_id = r.course_id join public.holes h on h.tee_id = te.id
          where r.tournament_id = t.id) as holes
      from public.tournaments t where t.slug like 'e2e-%') x`)

  const want: Seeded[] = Object.values(SLUGS)
    .sort()
    .map((slug) => ({
      slug,
      tournament: 'live',
      round: 'live',
      players: PLAYERS.map((p) => ({ name: p.name, fullName: p.fullName, base: p.base, group: p.group, pin: true })),
      holes: CARD,
    }))
  if (JSON.stringify(seeded) !== JSON.stringify(want)) {
    throw new Error(`e2e/stack/seed.sql and e2e/stack/field.ts disagree.\nseeded: ${JSON.stringify(seeded)}\nfield:  ${JSON.stringify(want)}`)
  }
}

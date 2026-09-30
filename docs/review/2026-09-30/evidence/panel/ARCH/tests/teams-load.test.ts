/**
 * ARCH probe: what the tournament store asks PostgREST for when the tournament has a team.
 * The fake client answers like production does for an ORDER BY on a missing column
 * (verified with curl: team_members?order=id.asc → 400 42703 "column team_members.id does not exist").
 */
import { expect, it, vi } from 'vitest'

const calls: Array<{ table: string; order: string[] }> = []
const COLUMNS: Record<string, string[]> = { team_members: ['team_id', 'player_id', 'tournament_id'] }
function builder(table: string) {
  const order: string[] = []
  const b: Record<string, unknown> = {}
  const self = () => b
  Object.assign(b, {
    select: self, eq: self, in: self, neq: self,
    order: (c: string) => { order.push(c); return b },
    single: () => Promise.resolve({ data: { id: 't1', slug: 's', name: 'T', join_code: 'ABCDEF', status: 'live', settings: {}, timezone: 'x', currency: 'MXN' }, error: null }),
    range: () => {
      calls.push({ table, order: [...order] })
      const cols = COLUMNS[table]
      if (cols && order.some((c) => !cols.includes(c))) return Promise.resolve({ data: null, error: { message: `column ${table}.${order.find((c) => !cols.includes(c))} does not exist`, code: '42703' } })
      const rows: Record<string, unknown[]> = { teams: [{ id: 'team1', number: 1, name: null }] }
      return Promise.resolve({ data: rows[table] ?? [], error: null })
    },
  })
  return b
}
vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({
  supabase: () => ({ from: (t: string) => builder(t), channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel: async () => undefined }),
  supabaseConfigured: true,
}))
vi.mock('/home/user/Cardi-Golf/src/data/snapshotCache', () => ({ saveSnapshot: async () => undefined }))

const { useTournament } = await import('/home/user/Cardi-Golf/src/data/tournamentStore')

it('a tournament with one team loads', async () => {
  await useTournament.getState().load('t1')
  const tm = calls.find((c) => c.table === 'team_members')
  console.log('team_members ordered by:', tm?.order, '→ store error:', useTournament.getState().error, 'data loaded:', !!useTournament.getState().data)
  expect(useTournament.getState().error).toBeNull()
})

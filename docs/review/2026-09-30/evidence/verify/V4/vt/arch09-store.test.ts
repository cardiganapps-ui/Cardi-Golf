// ARCH-09, V4's own repro: the REAL tournament store + a REAL supabase-js client. Every table is answered
// locally with canned rows (a live tournament with one team), except team_members, which goes to
// PRODUCTION PostgREST with the anon key (no data needed: the error is a column check).
// Control: the same request with only its ORDER BY rewritten to the table's real primary key.
import { afterEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs')
  const env = Object.fromEntries(
    fs.readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8').split('\n').filter((l: string) => /^VITE_SUPABASE_/.test(l)).map((l: string) => l.split('=')),
  )
  return { env, seen: [] as string[], fixOrder: false, prod: [] as Array<{ status: number; body: string }> }
})

const TID = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'

vi.mock('/home/user/Cardi-Golf/src/data/snapshotCache', () => ({ saveSnapshot: async () => undefined }))
vi.mock('/home/user/Cardi-Golf/src/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const realFetch = globalThis.fetch
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const stubFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const table = url.pathname.replace('/rest/v1/', '')
    h.seen.push(`${table}?${decodeURIComponent(url.searchParams.toString())}`)
    if (table === 'team_members') {
      if (h.fixOrder) url.searchParams.set('order', 'team_id.asc,player_id.asc')
      const r = await realFetch(url.href, init)
      const body = await r.clone().text()
      h.prod.push({ status: r.status, body })
      return r
    }
    if (table === 'tournaments') return json({ id: TID, slug: 'con-equipos', name: 'Torneo con equipos', tagline: null, logo_url: null, accent_color: null, join_code: 'ABCDEF', status: 'live', current_round_id: null, settings: {}, banker_player_id: null, timezone: 'America/Mazatlan', currency: 'MXN', created_by: null, created_at: '2026-09-30T00:00:00Z' })
    if (table === 'teams') return json([{ id: TEAM, tournament_id: TID, name: 'Equipo 1', number: 1, drawn_at: null, created_at: '2026-09-30T00:00:00Z' }])
    return json([])
  }
  let client: ReturnType<typeof createClient> | null = null
  return {
    supabaseConfigured: true,
    supabase: () => {
      if (!client) {
        client = createClient(h.env.VITE_SUPABASE_URL, h.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: stubFetch } })
        // No realtime socket in this probe.
        ;(client as unknown as { channel: unknown }).channel = () => ({ on() { return this }, subscribe() { return this } })
        ;(client as unknown as { removeChannel: unknown }).removeChannel = async () => 'ok'
      }
      return client
    },
  }
})

const { useTournament } = await import('/home/user/Cardi-Golf/src/data/tournamentStore')

afterEach(() => {
  h.seen.length = 0
  h.prod.length = 0
  useTournament.setState({ tournamentId: null, data: null, error: null, loading: false })
})

it('as shipped: a tournament with one team does not load', async () => {
  h.fixOrder = false
  await useTournament.getState().load(TID)
  const st = useTournament.getState()
  console.log('SHIPPED request:', h.seen.find((s) => s.startsWith('team_members')))
  console.log('SHIPPED production answered:', JSON.stringify(h.prod))
  console.log('SHIPPED store.error:', st.error, '| data loaded:', !!st.data)
  expect(h.prod[0]?.status).toBe(400)
  expect(st.error).toContain('column team_members.id does not exist')
  expect(st.data).toBeNull()
})

it('control: the same request ordered by the real primary key loads', async () => {
  h.fixOrder = true
  await useTournament.getState().load(TID)
  const st = useTournament.getState()
  console.log('CONTROL production answered:', JSON.stringify(h.prod), '| store.error:', st.error, '| data loaded:', !!st.data, '| teams:', st.data?.snapshot.teams.length)
  expect(h.prod[0]?.status).toBe(200)
  expect(st.error).toBeNull()
  expect(st.data?.snapshot.teams.length).toBe(1)
})

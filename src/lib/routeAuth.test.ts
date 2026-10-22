/**
 * The course routes' gate (src/server/auth.ts, QA-14): the per-address limit and the session check, on
 * their own. The routes' own tests (courseSearch.test.ts, scorecardExtract.test.ts) run them end to end.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  answer: { data: true, error: null } as { data: unknown; error: unknown },
  rpcs: [] as string[],
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: async (fn: string) => (db.rpcs.push(fn), db.answer) }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  db.answer = { data: true, error: null }
  db.rpcs = []
})

const auth = () => import('../server/auth')
const req = (headers: Record<string, unknown>, remoteAddress?: string) =>
  ({ headers, socket: remoteAddress ? { remoteAddress } : undefined }) as never

describe('the per-address limit', () => {
  it('counts each route apart, by the first forwarded address, else the socket’s', async () => {
    const { rateLimited } = await auth()
    for (let i = 0; i < 3; i++)
      expect(rateLimited(req({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }), 'a', 3, 60_000)).toBe(false)
    expect(rateLimited(req({ 'x-forwarded-for': ['203.0.113.1'] }), 'a', 3, 60_000)).toBe(true)
    expect(rateLimited(req({ 'x-forwarded-for': '203.0.113.1' }), 'b', 3, 60_000)).toBe(false)
    expect(rateLimited(req({}, '192.0.2.4'), 'a', 3, 60_000)).toBe(false)
  })

  it('callers with no address at all share one count', async () => {
    const { rateLimited } = await auth()
    expect(rateLimited(req({}), 'a', 1, 60_000)).toBe(false)
    expect(rateLimited(req({ 'x-forwarded-for': '' }), 'a', 1, 60_000)).toBe(true)
  })

  it('forgets everyone past 5,000 addresses, so its memory stays small', async () => {
    const { rateLimited } = await auth()
    expect(rateLimited(req({ 'x-forwarded-for': '198.51.100.1' }), 'a', 1, 60_000)).toBe(false)
    expect(rateLimited(req({ 'x-forwarded-for': '198.51.100.1' }), 'a', 1, 60_000)).toBe(true)
    for (let i = 0; i < 5_000; i++) rateLimited(req({ 'x-forwarded-for': `10.1.${i >> 8}.${i & 255}` }), 'a', 1, 60_000)
    expect(rateLimited(req({ 'x-forwarded-for': '198.51.100.1' }), 'a', 1, 60_000)).toBe(false)
  })
})

describe('the session check', () => {
  const res = () => {
    const out = { status: 0, body: null as unknown }
    const r = {
      status: (s: number) => ((out.status = s), r),
      json: (b: unknown) => ((out.body = b), r),
    }
    return { out, r: r as never }
  }

  it('lets through only a session the database says may manage courses', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.invalid')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const { requireCourseManager } = await auth()
    const ok = res()
    expect(await requireCourseManager(req({ authorization: 'Bearer t' }), ok.r)).toBe(true)
    expect(ok.out.status).toBe(0)
    expect(db.rpcs).toEqual(['can_manage_courses'])
    for (const answer of [
      { data: false, error: null },
      { data: 'true', error: null },
      { data: null, error: { message: 'x' } },
    ]) {
      db.answer = answer
      const no = res()
      expect(await requireCourseManager(req({ authorization: 'Bearer t' }), no.r)).toBe(false)
      expect(no.out).toEqual({ status: 403, body: { error: 'Solo el Comité puede cargar campos.', code: 'forbidden' } })
    }
  })

  it('no token, or no database to ask: 401, and the database is not asked', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const { requireCourseManager } = await auth()
    const out = res()
    expect(await requireCourseManager(req({ authorization: 'Bearer t' }), out.r)).toBe(false)
    expect(out.out).toEqual({
      status: 401,
      body: { error: 'Inicia sesión para usar esta función.', code: 'unauthorized' },
    })
    expect(db.rpcs).toEqual([])
  })
})

/**
 * The dispatch route (api/push-dispatch.ts): the database's trigger hands it a notice and the phones to send it
 * to, it signs and sends each, and gives the dead ones back. An account's notice carries the inbox's count for
 * the icon; a PIN phone's (0051, PWA-10) carries none, so the icon is left alone (it used to get «0», which
 * cleared whatever the icon showed).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ calls: [] as Array<{ endpoint: string; payload: Record<string, unknown> }>, dead: new Set<string>() }))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      sent.calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
      if (sent.dead.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 })
    }),
  },
}))
const pruned = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: vi.fn(async (fn: string, args: unknown) => void pruned.calls.push([fn, args])) }) }))

const { default: handler } = await import('../../api/push-dispatch')

const ENV = { PUSH_DISPATCH_SECRET: 's3cret', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VITE_SUPABASE_URL: 'https://db.invalid', VITE_SUPABASE_ANON_KEY: 'anon' }
afterEach(() => {
  vi.unstubAllEnvs()
  sent.calls = []
  sent.dead.clear()
  pruned.calls = []
})

async function call(body: unknown, auth = 'Bearer s3cret') {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  let status = 0
  let json: unknown = null
  const res = {
    status(code: number) {
      status = code
      return this
    },
    json(x: unknown) {
      json = x
      return this
    },
  }
  await handler({ method: 'POST', headers: { authorization: auth }, body } as never, res as never)
  return { status, json }
}
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'k', auth: 'a' } })

describe('the dispatch route', () => {
  it('an account’s notice: its words and the inbox’s count for the icon', async () => {
    const r = await call({ subscriptions: [sub('https://push.test/acct')], notice: { id: 'n1', kind: 'results', data: { tournament: 'Copa', slug: 'copa', rankLabel: '2', field: 8 }, actor: null }, unread: 3 })
    expect(r).toEqual({ status: 200, json: { sent: 1, pruned: 0 } })
    expect(sent.calls[0]!.payload).toEqual({ title: 'Polo', body: 'Resultados de Copa: quedaste 2.º de 8', url: '/t/copa', tag: 'n1', badge: 3 })
  })

  it('a PIN phone’s notice: the tournament above, no count, so the icon keeps what it shows (PWA-10)', async () => {
    const r = await call({
      subscriptions: [sub('https://push.test/ana'), sub('https://push.test/gone')],
      notice: { id: 'n2', kind: 'round_live', data: { tournament: 'Nacho’s Bachelor', slug: 'nachos-bachelor', round: 1, group: 2, startHole: 10, teeTime: '09:00' }, actor: null },
    })
    expect(r.status).toBe(200)
    expect(sent.calls.map((c) => c.payload)).toEqual([
      { title: 'Nacho’s Bachelor', body: 'Empezó el día 1. Tu grupo 2 sale del hoyo 10 a las 9:00.', url: '/t/nachos-bachelor/tarjeta', tag: 'n2' },
      { title: 'Nacho’s Bachelor', body: 'Empezó el día 1. Tu grupo 2 sale del hoyo 10 a las 9:00.', url: '/t/nachos-bachelor/tarjeta', tag: 'n2' },
    ])
    expect(sent.calls.every((c) => !('badge' in c.payload))).toBe(true)
  })

  it('a dead address goes back to the database with the shared secret, through the anon key', async () => {
    sent.dead.add('https://push.test/gone')
    const r = await call({ subscriptions: [sub('https://push.test/ana'), sub('https://push.test/gone')], notice: { id: 'n3', kind: 'card_to_sign', data: { tournament: 'X', slug: 'x', round: 1, group: 1 }, actor: null } })
    expect(r.json).toEqual({ sent: 1, pruned: 1 })
    expect(pruned.calls).toEqual([['push_prune', { p_secret: 's3cret', p_endpoints: ['https://push.test/gone'] }]])
  })

  it('nothing without the secret', async () => {
    const r = await call({ subscriptions: [sub('https://push.test/ana')], notice: { id: 'n4', kind: 'round_live', data: {}, actor: null } }, 'Bearer nope')
    expect(r.status).toBe(401)
    expect(sent.calls).toEqual([])
  })
})

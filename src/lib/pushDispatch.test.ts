/**
 * The dispatch route (api/push-dispatch.ts): the database's trigger hands it a notice and the phones to send it
 * to, it signs and sends each, and gives the dead ones back. An account's notice carries the inbox's count for
 * the icon; a PIN phone's (0052, PWA-10) carries none, so the icon is left alone (it used to get «0», which
 * cleared whatever the icon showed).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callRoute, leaked } from './testing/route'

const sent = vi.hoisted(() => ({
  calls: [] as Array<{ endpoint: string; payload: Record<string, unknown>; options: unknown }>,
  /** Each endpoint's refusal: the push service's status code. */
  refuse: new Map<string, number>(),
  vapid: [] as unknown[][],
}))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn((...args: unknown[]) => void sent.vapid.push(args)),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string, options: unknown) => {
      sent.calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options })
      const code = sent.refuse.get(sub.endpoint)
      if (code) throw Object.assign(new Error('refused'), { statusCode: code })
    }),
  },
}))
const pruned = vi.hoisted(() => ({ calls: [] as unknown[], clients: [] as unknown[][] }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    pruned.clients.push(args.slice(0, 2))
    return { rpc: vi.fn(async (fn: string, args: unknown) => void pruned.calls.push([fn, args])) }
  },
}))

const { default: handler } = await import('../../api/push-dispatch')

const ENV = { PUSH_DISPATCH_SECRET: 's3cret', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VITE_SUPABASE_URL: 'https://db.invalid', VITE_SUPABASE_ANON_KEY: 'anon' }
afterEach(() => {
  vi.unstubAllEnvs()
  sent.calls = []
  sent.refuse.clear()
  sent.vapid = []
  pruned.calls = []
  pruned.clients = []
})

async function call(body: unknown, auth: string | null = 'Bearer s3cret', method = 'POST') {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  const r = await callRoute(handler, { method, headers: auth == null ? {} : { authorization: auth }, body })
  expect(leaked(r, ['s3cret', 'priv'])).toEqual([])
  return { status: r.status, json: r.body }
}
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'k', auth: 'a' } })

describe('the dispatch route', () => {
  it('an account’s notice: its words and the inbox’s count for the icon', async () => {
    const r = await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/acct')], notice: { id: 'n1', kind: 'results', data: { tournament: 'Copa', slug: 'copa', rankLabel: '2', field: 8 }, actor: null }, unread: 3 })
    expect(r).toEqual({ status: 200, json: { sent: 1, pruned: 0 } })
    expect(sent.calls[0]!.payload).toEqual({ title: 'Polo', body: 'Resultados de Copa: quedaste 2.º de 8', url: '/t/copa', tag: 'n1', badge: 3 })
  })

  it('a PIN phone’s notice: the tournament above, no count, so the icon keeps what it shows (PWA-10)', async () => {
    const r = await call({
      subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana'), sub('https://fcm.googleapis.com/fcm/send/gone')],
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
    sent.refuse.set('https://fcm.googleapis.com/fcm/send/gone', 410)
    const r = await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana'), sub('https://fcm.googleapis.com/fcm/send/gone')], notice: { id: 'n3', kind: 'card_to_sign', data: { tournament: 'X', slug: 'x', round: 1, group: 1 }, actor: null } })
    expect(r.json).toEqual({ sent: 1, pruned: 1 })
    expect(pruned.calls).toEqual([['push_prune', { p_secret: 's3cret', p_endpoints: ['https://fcm.googleapis.com/fcm/send/gone'] }]])
    expect(pruned.clients).toEqual([['https://db.invalid', 'anon']])
  })

  it('an endpoint off the push services is never called, and goes back to be pruned (SEC-03)', async () => {
    const off = ['https://httpbin.org/status/201', 'https://169.254.169.254/latest', 'https://fcm.googleapis.com.evil.test/x', 'http://fcm.googleapis.com/fcm/send/x']
    const r = await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana'), ...off.map(sub)], notice: { id: 'n9', kind: 'card_to_sign', data: { tournament: 'X', slug: 'x', round: 1, group: 1 }, actor: null } })
    expect(sent.calls.map((c) => c.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/ana'])
    expect(r.json).toEqual({ sent: 1, pruned: off.length })
    expect(pruned.calls).toEqual([['push_prune', { p_secret: 's3cret', p_endpoints: off }]])
  })

  it('a subscription with no address is neither called nor sent to be pruned', async () => {
    const r = await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana'), {}, null, { endpoint: 7 }], notice: { id: 'n10', kind: 'card_to_sign', data: { tournament: 'X', slug: 'x', round: 1, group: 1 }, actor: null } })
    expect(sent.calls.map((c) => c.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/ana'])
    expect(r.json).toEqual({ sent: 1, pruned: 0 })
    expect(pruned.calls).toEqual([])
  })

  it('nothing without the secret', async () => {
    const r = await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice: { id: 'n4', kind: 'round_live', data: {}, actor: null } }, 'Bearer nope')
    expect(r.status).toBe(401)
    expect(sent.calls).toEqual([])
  })

  it('a wrong secret of the same length, none, or a bare one: 401, nothing sent', async () => {
    for (const auth of ['Bearer s3creT', 'Bearer s3cret ', 's3cret', 'Bearer', '', null]) {
      const r = await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice: { id: 'n5', kind: 'round_live', data: {}, actor: null } }, auth)
      expect(r).toEqual({ status: 401, json: { error: 'unauthorized' } })
    }
    expect(sent.calls).toEqual([])
    expect(sent.vapid).toEqual([])
  })

  it('only POST: 405 before anything else', async () => {
    const r = await call({}, 'Bearer s3cret', 'GET')
    expect(r).toEqual({ status: 405, json: { error: 'method' } })
  })

  it('a deploy without the secret or the VAPID pair: 503, nothing sent', async () => {
    for (const missing of ['PUSH_DISPATCH_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
      for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
      vi.stubEnv(missing, '')
      const { default: fresh } = await import('../../api/push-dispatch')
      const r = await callRoute(fresh, { method: 'POST', headers: { authorization: 'Bearer s3cret' }, body: { subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice: { id: 'n6', kind: 'round_live', data: {}, actor: null } } })
      expect([r.status, r.body]).toEqual([503, { error: 'push not configured' }])
    }
    expect(sent.calls).toEqual([])
  })

  it('a body that is not a notice, or not JSON at all: 400, never a 500', async () => {
    for (const body of [undefined, null, '{"notice": ', '[]', 42]) {
      const r = await call(body)
      expect(r).toEqual({ status: 400, json: { error: 'body' } })
    }
    expect(sent.calls).toEqual([])
  })

  it('no notice, or nobody to send it to: nothing sent, nothing signed', async () => {
    const notice = { id: 'n7', kind: 'round_live', data: {}, actor: null }
    for (const body of [{ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')] }, { notice }, { notice, subscriptions: [] }, { notice, subscriptions: 'https://fcm.googleapis.com/fcm/send/ana' }]) {
      expect(await call(body)).toEqual({ status: 200, json: { sent: 0 } })
    }
    expect(sent.vapid).toEqual([])
  })

  it('a JSON body sent as text is read the same', async () => {
    const r = await call(JSON.stringify({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice: { id: 'n8', kind: 'results', data: { tournament: 'Copa', slug: 'copa', rankLabel: '1', field: 4 }, actor: null } }))
    expect(r).toEqual({ status: 200, json: { sent: 1, pruned: 0 } })
  })

  it('signs with the VAPID pair and the subject (the default when none is set), a day to live', async () => {
    const notice = { id: 'n9', kind: 'round_live', data: {}, actor: null }
    await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice })
    expect(sent.vapid).toEqual([['mailto:golf@cardigan.mx', 'pub', 'priv']])
    expect(sent.calls[0]!.options).toEqual({ TTL: 86400, urgency: 'normal' })
    vi.stubEnv('VAPID_SUBJECT', 'mailto:otro@example.com')
    const { default: fresh } = await import('../../api/push-dispatch')
    await callRoute(fresh, { method: 'POST', headers: { authorization: 'Bearer s3cret' }, body: { subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice } })
    expect(sent.vapid.at(-1)).toEqual(['mailto:otro@example.com', 'pub', 'priv'])
  })

  it('at most 20 phones a notice', async () => {
    const subs = Array.from({ length: 25 }, (_, i) => sub(`https://fcm.googleapis.com/fcm/send/${i}`))
    const r = await call({ subscriptions: subs, notice: { id: 'n10', kind: 'round_live', data: {}, actor: null } })
    expect(r.json).toEqual({ sent: 20, pruned: 0 })
    expect(sent.calls.map((c) => c.endpoint)).toEqual(subs.slice(0, 20).map((s) => s.endpoint))
  })

  it('only gone for good (404, 410) is pruned; a push service that is down is tried again on the next notice', async () => {
    sent.refuse.set('https://fcm.googleapis.com/fcm/send/404', 404)
    sent.refuse.set('https://fcm.googleapis.com/fcm/send/500', 500)
    sent.refuse.set('https://fcm.googleapis.com/fcm/send/413', 413)
    const r = await call({ subscriptions: ['404', '500', '413', 'ok'].map((e) => sub(`https://fcm.googleapis.com/fcm/send/${e}`)), notice: { id: 'n11', kind: 'round_live', data: {}, actor: null } })
    expect(r.json).toEqual({ sent: 1, pruned: 1 })
    expect(pruned.calls).toEqual([['push_prune', { p_secret: 's3cret', p_endpoints: ['https://fcm.googleapis.com/fcm/send/404'] }]])
  })

  it('the icon’s count: a negative one is 0, anything that is not a number is left out', async () => {
    const notice = { id: 'n12', kind: 'round_live', data: {}, actor: null }
    const badges = []
    for (const unread of [-3, 0, 5, Number.NaN, '4', null]) {
      sent.calls = []
      await call({ subscriptions: [sub('https://fcm.googleapis.com/fcm/send/ana')], notice, unread })
      badges.push(sent.calls[0]!.payload.badge)
    }
    expect(badges).toEqual([0, 0, 5, undefined, undefined, undefined])
  })
})

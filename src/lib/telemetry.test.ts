import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const getSession = vi.fn()
vi.mock('./supabase', () => ({ supabaseConfigured: true, supabase: () => ({ rpc, auth: { getSession } }) }))

const tel = await import('./telemetry')

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: 1, error: null })
  getSession.mockReset()
  getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
  tel.resetTelemetryForTests(true)
})
afterEach(() => tel.resetTelemetryForTests(false))

describe('telemetry', () => {
  it('is off in tests and dev builds, on in production', () => {
    expect(tel.telemetryAllowed({ PROD: false, MODE: 'development' })).toBe(false)
    expect(tel.telemetryAllowed({ PROD: true, MODE: 'test' })).toBe(false)
    expect(tel.telemetryAllowed({ PROD: true, MODE: 'production' })).toBe(true)
    expect(tel.telemetryAllowed({ PROD: true, MODE: 'production', VITE_DESIGN_ROUTES: '1' })).toBe(false)
  })

  it('sends nothing while off', () => {
    tel.resetTelemetryForTests(false)
    tel.track('funnel', 'x')
    tel.reportError('window.error', new Error('boom'))
    expect(tel.queuedEvents()).toEqual([])
  })

  it('takes addresses, tokens and ids out of a message, and ids out of a route', () => {
    expect(tel.scrub('falló ana@polo.test eyJa.eyJb.c d1b2c3d4-0000-4000-8000-00000000000a')).toBe('falló [correo] [token] [id]')
    expect(tel.routeOf('/t/nacho-2027/tarjeta')).toBe('/t/:slug/tarjeta')
    expect(tel.routeOf('/p/diego/vs')).toBe('/p/:handle/vs')
    expect(tel.routeOf('/c/unirme/ABC123')).toBe('/c/unirme/:code')
    expect(tel.routeOf('/c/los-de-siempre')).toBe('/c/:slug')
    expect(tel.routeOf('/admin/personas/d1b2c3d4-0000-4000-8000-00000000000a')).toBe('/admin/personas/:id')
  })

  it('groups an error: the same one once a minute, at most 30 per page load', () => {
    for (let i = 0; i < 5; i++) tel.reportError('window.error', new TypeError('boom'))
    expect(tel.queuedEvents().filter((e) => e.kind === 'error')).toHaveLength(1)
    const e = tel.queuedEvents()[0]!
    expect(e).toMatchObject({ kind: 'error', name: 'window.error', data: { message: 'TypeError: boom' } })
    expect(e.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    for (let i = 0; i < 50; i++) tel.reportError('window.error', new TypeError(`boom ${i}`))
    expect(tel.queuedEvents().filter((x) => x.kind === 'error')).toHaveLength(30)
  })

  it('keeps the text of the engine\'s own errors only: any other message may carry a name', () => {
    class UserError extends Error {
      name = 'UserError'
    }
    tel.reportError('unhandledrejection', new UserError('El hoyo 4 de Justo quedó para el Comité'))
    tel.reportError('unhandledrejection', Object.assign(new Error('Diego no está en el grupo'), { code: '42501' }))
    tel.reportError('unhandledrejection', 'Mateo')
    // A JSON SyntaxError quotes its input («"Diego Ará"... is not valid JSON»).
    tel.reportError('unhandledrejection', new SyntaxError('Unexpected token D, "Diego Ará"... is not valid JSON'))
    expect(tel.queuedEvents().map((e) => e.data?.message)).toEqual(['UserError', 'Error (42501)', 'no es un Error (string)', 'SyntaxError'])
  })

  it('counts a step once per tournament when asked', () => {
    tel.setTelemetryTournament('t1')
    tel.step('tournament_open', { once: true })
    tel.step('tournament_open', { once: true })
    tel.setTelemetryTournament('t2')
    tel.step('tournament_open', { once: true })
    tel.step('hole_saved')
    tel.step('hole_saved')
    const steps = tel.queuedEvents().filter((e) => e.kind === 'funnel')
    expect(steps.map((e) => `${e.name}@${e.tournamentId}`)).toEqual(['tournament_open@t1', 'tournament_open@t2', 'hole_saved@t2', 'hole_saved@t2'])
  })

  describe('sync times', () => {
    afterEach(() => vi.useRealTimers())

    it('a save: the round trip, and the clock offset from the stored rows', () => {
      // This phone's clock is 1 s ahead. The call went out at 10:00:00.000 and came back at .400 by the server's
      // clock, which stored the rows at .100: the midpoint (.200) against .100 reads +1.1 s, off by at most half
      // the round trip.
      const server = Date.parse('2026-10-12T10:00:00.100Z')
      tel.saveAnswered(server + 900, server + 1300, [{ updated_at: '2026-10-12T10:00:00.100Z' }])
      expect(tel.queuedEvents().at(-1)).toMatchObject({ kind: 'sync', name: 'save_ack', value: 400 })
      expect(tel.clockOffset()).toBe(1100)
      // A slower sample never replaces a better one; a faster one does.
      tel.saveAnswered(server + 900, server + 3900, [{ updated_at: '2026-10-12T10:00:00.100Z' }])
      expect(tel.clockOffset()).toBe(1100)
      tel.saveAnswered(server + 950, server + 1050, [{ updated_at: '2026-10-12T10:00:00.100Z' }])
      expect(tel.clockOffset()).toBe(1000)
      // A replayed answer carries the first attempt's stamp: even a fast one is no sample.
      tel.saveAnswered(server + 60_000, server + 60_010, [{ updated_at: '2026-10-12T10:00:00.100Z' }], true)
      expect(tel.clockOffset()).toBe(1000)
    })

    it('another phone\'s change: how long after the server stored it, by the server\'s clock', () => {
      vi.useFakeTimers()
      const server = Date.parse('2026-10-12T10:00:00.000Z')
      tel.notePushed(['r1:mine:3'])
      tel.saveAnswered(server + 1000, server + 1000, [{ updated_at: '2026-10-12T10:00:00.000Z' }])
      expect(tel.clockOffset()).toBe(1000)
      vi.setSystemTime(server + 1000 + 1500)
      tel.changeArrived({ round_id: 'r1', player_id: 'other', hole: 3, updated_at: '2026-10-12T10:00:01.000Z' })
      expect(tel.queuedEvents().at(-1)).toMatchObject({ name: 'apply_lag', value: 500, data: { corrected: true } })
    })

    it('leaves out this phone\'s own echo, a stampless row, and a lag from a phone that slept', () => {
      vi.useFakeTimers()
      const now = Date.parse('2026-10-12T10:00:00.000Z')
      vi.setSystemTime(now)
      // Recorded when the write goes out: an echo that beats the answer is still this phone's.
      tel.notePushed(['r1:mine:3'])
      const before = tel.queuedEvents().length
      tel.changeArrived({ round_id: 'r1', player_id: 'mine', hole: 3, updated_at: '2026-10-12T09:59:59.900Z' })
      tel.changeArrived({ round_id: 'r1', player_id: 'other', hole: 3 })
      tel.changeArrived({ round_id: 'r1', player_id: 'other', hole: 4, updated_at: '2026-10-12T09:40:00.000Z' })
      expect(tel.queuedEvents()).toHaveLength(before)
      // Two minutes later the same key is someone else's change again.
      vi.setSystemTime(now + 3 * 60_000)
      tel.changeArrived({ round_id: 'r1', player_id: 'mine', hole: 3, updated_at: '2026-10-12T10:02:59.000Z' })
      expect(tel.queuedEvents().at(-1)).toMatchObject({ name: 'apply_lag', value: 1000, data: { corrected: false } })
    })
  })

  it('sends in batches of 50, and keeps what a failure did not send', async () => {
    for (let i = 0; i < 120; i++) tel.track('funnel', 'x')
    rpc.mockResolvedValueOnce({ data: 50, error: null }).mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
    await tel.flush()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]![0]).toBe('log_client_events')
    expect((rpc.mock.calls[0]![1] as { p_events: unknown[] }).p_events).toHaveLength(50)
    expect(tel.queuedEvents()).toHaveLength(70)
    await tel.flush()
    expect(tel.queuedEvents()).toHaveLength(0)
  })

  it('drops a batch the server refuses as data (class 22) instead of sending it forever', async () => {
    for (const code of ['22023', '22P02', '22003']) {
      tel.track('funnel', 'x')
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'no' } })
      await tel.flush()
      expect(tel.queuedEvents()).toHaveLength(0)
    }
  })

  it('takes off the queue exactly what was sent, whatever arrived meanwhile', async () => {
    for (let i = 0; i < 180; i++) tel.track('funnel', `antes${i}`)
    let release!: () => void
    rpc.mockImplementationOnce(() => new Promise((r) => (release = () => r({ data: 50, error: null }))))
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
    const sending = tel.flush()
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
    for (let i = 0; i < 100; i++) tel.track('funnel', `durante${i}`)
    release()
    await sending
    // The queue kept its newest 200 while the batch was out (antes80 on); slicing 50 off its head would have lost
    // antes80–antes129, never sent. Taking off what was sent, by id, keeps all of them.
    const names = tel.queuedEvents().map((e) => e.name)
    expect(names).toHaveLength(200)
    expect(names[0]).toBe('antes80')
    expect(names.at(-1)).toBe('durante99')
  })

  it('sends nothing without a session, and asks again later', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    tel.track('funnel', 'x')
    await tel.flush()
    await tel.heartbeat()
    expect(rpc).not.toHaveBeenCalled()
    expect(tel.queuedEvents()).toHaveLength(1)
  })

  it('stops for the page load on a database without the function, keeping what it had', async () => {
    tel.track('funnel', 'x')
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await tel.flush()
    expect(tel.queuedEvents()).toHaveLength(1)
    tel.track('funnel', 'y')
    expect(tel.queuedEvents()).toHaveLength(1)
    await tel.flush()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps everything when the network fails', async () => {
    tel.track('funnel', 'x')
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await tel.flush()
    expect(tel.queuedEvents()).toHaveLength(1)
  })

  it('a changed outbox beats soon, once per change, never sooner than 15 s after the last', async () => {
    vi.useFakeTimers()
    try {
      let pending = 3
      tel.setDeviceSnapshot(() => ({ pending, rejected: 0, oldestPendingAt: null, lastSyncAt: null }))
      await tel.heartbeat()
      expect(rpc).toHaveBeenCalledTimes(1)
      tel.outboxChanged()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(rpc).toHaveBeenCalledTimes(1)
      pending = 0
      tel.outboxChanged()
      tel.outboxChanged()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(rpc).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(rpc).toHaveBeenCalledTimes(2)
      expect(rpc.mock.calls[1]![1]).toMatchObject({ p: { pending: 0 } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a heartbeat the server did not take leaves the next change free to send one', async () => {
    vi.useFakeTimers()
    try {
      let pending = 0
      tel.setDeviceSnapshot(() => ({ pending, rejected: 0, oldestPendingAt: null, lastSyncAt: null }))
      rpc.mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'connection failure' } })
      await tel.heartbeat()
      pending = 0
      tel.outboxChanged()
      await vi.advanceTimersByTimeAsync(3_000)
      expect(rpc).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a heartbeat carries the build, the tournament and what the outbox holds', async () => {
    tel.setDeviceSnapshot(() => ({ pending: 3, rejected: 1, oldestPendingAt: '2026-10-12T04:00:00.000Z', lastSyncAt: null }))
    tel.setTelemetryTournament('t9')
    await tel.heartbeat()
    const call = rpc.mock.calls.find((c) => c[0] === 'heartbeat')!
    expect(call[1]).toMatchObject({ p: { tournamentId: 't9', pending: 3, rejected: 1, oldestPendingAt: '2026-10-12T04:00:00.000Z', deviceId: tel.getDeviceId() } })
    expect(typeof (call[1] as { p: { build: unknown } }).p.build).toBe('number')
  })
})

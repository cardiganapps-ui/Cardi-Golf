/**
 * REL-08: the Comité's inbox of holes the server kept instead of taking them
 * (rejected_writes, 0026), read and answered over the app's real Supabase
 * client (testing/fakePhone.ts). The fake server answers
 * resolve_rejected_write (0028) with the database's rules, held to them by
 * cases/serverRules.json. Here the Comité is an admin player (p1), as on the
 * course.
 */
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from './mappers'
import { enterAs, installFakePhone } from './testing/fakePhone'

const { server } = installFakePhone()
const { appliedValue, listOpenRejected, loadRejectedInbox, resolveInboxItem, sentValue, useRejectedInbox } = await import('./rejectedInbox')
const { humanError } = await import('../lib/humanError')

let me = ''
beforeAll(async () => {
  me = await enterAs('p1')
})

/** One row as save_hole keeps it. */
const kept = (id: string, o: Partial<Row> = {}): Row => ({
  id,
  tournament_id: 't1',
  round_id: 'r1',
  hole: 5,
  player_id: 'p2',
  writer_player_id: 'p3',
  auth_user_id: 'uid-p3',
  device_id: null,
  mutation_id: null,
  payload: { player_id: 'p2', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } },
  reason: 'conflict',
  status: 'open',
  created_at: `2027-04-09T15:0${id.slice(-1)}:00Z`,
  ...o,
})

beforeEach(() => {
  server.reset()
  // The Comité: p1, made admin.
  server.tables.players = server.tables.players!.map((p) => (p.id === 'p1' ? { ...p, is_admin: true } : p))
  server.seed('scores', [{ round_id: 'r1', player_id: 'p2', hole: 5, strokes: 5, putts: 2, picked_up: false, entered_by: 'p1' }])
  server.tables.rejected_writes = [
    kept('w2', { hole: 7, reason: 'round_not_live', payload: { player_id: 'p2', fields: { strokes: 4, putts: 1, picked_up: false }, base: {} } }),
    kept('w1'),
    kept('w3', { status: 'applied' }),
    kept('w4', { tournament_id: 't9' }),
  ]
  useRejectedInbox.setState({ tournamentId: null, items: [], status: 'idle', error: null, fixture: false })
})

const ids = () => useRejectedInbox.getState().items.map((x) => x.id)
const row = (id: string) => server.tables.rejected_writes!.find((r) => r.id === id)!

describe('the list', () => {
  it('holds the tournament\'s open rows, oldest first, with what the phone sent', async () => {
    const items = await listOpenRejected('t1')
    expect(items?.map((x) => x.id)).toEqual(['w1', 'w2'])
    expect(items?.[0]).toMatchObject({ roundId: 'r1', hole: 5, playerId: 'p2', writerPlayerId: 'p3', reason: 'conflict', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } })
  })

  it('a database without the inbox yet: «unavailable», not a broken screen (PGRST205, 42703)', async () => {
    for (const [status, code] of [
      [404, 'PGRST205'],
      [400, '42703'],
    ] as const) {
      server.decide = (req) => (req.target === 'rejected_writes' ? { status, body: { code, details: null, hint: null, message: 'missing' } } : 'answer')
      await loadRejectedInbox('t1')
      expect(useRejectedInbox.getState()).toMatchObject({ status: 'unavailable', items: [] })
    }
  })

  it('any other failure is the store\'s error, said for people', async () => {
    server.decide = (req) => (req.target === 'rejected_writes' ? { status: 500, body: { code: 'XX000', details: null, hint: null, message: 'internal error in rejected_writes' } } : 'answer')
    await loadRejectedInbox('t1')
    const s = useRejectedInbox.getState()
    expect(s.status).toBe('error')
    expect(humanError(s.error)).not.toContain('rejected_writes')
  })
})

describe('applying and dismissing', () => {
  it('«Aplicar» sends the reason, writes the phone\'s fields over the hole as it stands, and the row leaves the list', async () => {
    await loadRejectedInbox('t1')
    expect(ids()).toEqual(['w1', 'w2'])
    await resolveInboxItem('t1', 'w1', 'apply', 'Beto confirma 6')
    expect(server.wire.filter((r) => r.target === 'rpc/resolve_rejected_write').map((r) => r.body)).toEqual([{ p_id: 'w1', p_action: 'apply', p_reason: 'Beto confirma 6' }])
    expect(ids()).toEqual(['w2'])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 6, putts: 2, picked_up: false, reason: 'Beto confirma 6', entered_by: 'p1' })
    expect(row('w1')).toMatchObject({ status: 'applied', resolved_by: me, resolution_note: 'Beto confirma 6' })
  })

  it('«Descartar» leaves the card as it is', async () => {
    await loadRejectedInbox('t1')
    await resolveInboxItem('t1', 'w2', 'dismiss', 'Ya lo capturó el Comité')
    expect(ids()).toEqual(['w1'])
    expect(server.score('p2', 7)).toBeUndefined()
    expect(row('w2')).toMatchObject({ status: 'dismissed', resolution_note: 'Ya lo capturó el Comité' })
  })

  it('a reason too short is refused in the server\'s words, and the row stays', async () => {
    await loadRejectedInbox('t1')
    const e = await resolveInboxItem('t1', 'w1', 'apply', 'ok').catch((x: unknown) => x)
    expect(humanError(e)).toBe('Escribe el motivo, al menos 3 letras')
    expect(ids()).toEqual(['w1', 'w2'])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 5 })
  })

  it('a row another Comité phone resolved first: refused, and the list read again drops it', async () => {
    await loadRejectedInbox('t1')
    row('w1').status = 'dismissed'
    const e = await resolveInboxItem('t1', 'w1', 'apply', 'Beto confirma 6').catch((x: unknown) => x)
    expect(humanError(e)).toBe('Esa captura ya estaba resuelta')
    expect(ids()).toEqual(['w2'])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 5 })
  })

  it('a phone that is not the Comité may not resolve one', async () => {
    server.tables.players = server.tables.players!.map((p) => (p.id === 'p1' ? { ...p, is_admin: false } : p))
    const e = await resolveInboxItem('t1', 'w1', 'dismiss', 'No me gusta').catch((x: unknown) => x)
    expect(humanError(e)).toBe('Solo el Comité puede resolver una captura rechazada')
    expect(row('w1').status).toBe('open')
  })
})

describe('what applying would leave (as 0028 writes it)', () => {
  const cur = { strokes: 5, putts: 2, pickedUp: false }
  it('only the fields the phone set, over the hole as it is now', () => {
    expect(appliedValue({ strokes: 6 }, cur)).toEqual({ strokes: 6, putts: 2, pickedUp: false })
    expect(appliedValue({ putts: 1 }, cur)).toEqual({ strokes: 5, putts: 1, pickedUp: false })
    expect(appliedValue({ strokes: 4 }, { strokes: null, putts: 1, pickedUp: true })).toEqual({ strokes: 4, putts: 1, pickedUp: false })
    expect(appliedValue({ picked_up: true }, cur)).toEqual({ strokes: null, putts: 2, pickedUp: true })
  })
  it('nothing the server would refuse', () => {
    expect(appliedValue({}, cur)).toBeNull()
    expect(appliedValue({ gross: 4 }, cur)).toBeNull()
    expect(appliedValue({ strokes: '4' }, cur)).toBeNull()
    expect(appliedValue({ strokes: 4.5 }, cur)).toBeNull()
    expect(appliedValue({ strokes: 16 }, cur)).toBeNull()
    expect(appliedValue({ putts: 6 }, cur)).toBeNull()
    expect(appliedValue({ putts: 2 }, null)).toBeNull()
    expect(appliedValue({ picked_up: 'sí' }, cur)).toBeNull()
    expect(appliedValue(null, cur)).toBeNull()
  })
  it('what the phone meant is its fields over the row it saw', () => {
    const item = { id: 'w', roundId: 'r1', hole: 5, playerId: 'p2', writerPlayerId: null, reason: 'conflict' as const, fields: { strokes: 6 }, base: { strokes: 4, putts: 3, picked_up: false }, server: null, createdAt: '' }
    expect(sentValue(item, cur)).toEqual({ strokes: 6, putts: 3, pickedUp: false })
    expect(sentValue({ ...item, base: undefined }, cur)).toEqual({ strokes: 6, putts: 2, pickedUp: false })
  })
})

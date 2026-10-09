/**
 * REL-08: the Comité's inbox of holes the server kept instead of taking them
 * (rejected_writes, 0026), read and answered over the app's real Supabase
 * client (testing/fakePhone.ts). The fake server answers rejected_inbox and
 * resolve_rejected_write (0028) with the database's rules, held to them by
 * cases/serverRules.json. Here the Comité is an admin player (p1), as on the
 * course.
 */
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from './mappers'
import { enterAs, installFakePhone } from './testing/fakePhone'

const { server } = installFakePhone()
const { appliedValue, dismissInboxItems, isStaleHole, listOpenRejected, loadRejectedInbox, resolveInboxItem, sameValue, seenHole, sentValue, useRejectedInbox } = await import('./rejectedInbox')
const { humanError } = await import('../lib/humanError')
const { t } = await import('../i18n/es-MX')

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
  reason: 'not_in_group',
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
    // A conflict the phone settled itself, and an untouched default the server refused: the Comité is asked about neither (0028).
    kept('w5', { reason: 'conflict', payload: { player_id: 'p2', fields: { strokes: 4, putts: 2, picked_up: false }, base: {}, server: { strokes: 5 } } }),
    kept('w6', { hole: 8, reason: 'round_not_live', payload: { player_id: 'p2', fields: { strokes: 4, putts: 2, picked_up: false }, base: {}, auto: true } }),
  ]
  useRejectedInbox.setState({ tournamentId: null, items: [], status: 'idle', error: null, fixture: false })
})

const ids = () => useRejectedInbox.getState().items.map((x) => x.id)
const row = (id: string) => server.tables.rejected_writes!.find((r) => r.id === id)!

describe('the list', () => {
  it('holds the tournament\'s open refusals of a typed value, oldest first, with what the phone sent', async () => {
    const items = await listOpenRejected('t1')
    expect(items?.map((x) => x.id)).toEqual(['w1', 'w2'])
    expect(items?.[0]).toMatchObject({ roundId: 'r1', hole: 5, playerId: 'p2', writerPlayerId: 'p3', reason: 'not_in_group', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } })
    expect(server.wire.filter((r) => r.target === 'rpc/rejected_inbox').map((r) => r.body)).toEqual([{ p_tournament_id: 't1' }])
  })

  it('never a conflict or an untouched default, even from a server that listed them', async () => {
    server.decide = (req) => (req.target === 'rpc/rejected_inbox' ? { status: 200, body: server.tables.rejected_writes!.filter((r) => r.tournament_id === 't1' && r.status === 'open') } : 'answer')
    expect((await listOpenRejected('t1'))?.map((x) => x.id).sort()).toEqual(['w1', 'w2'])
  })

  it('a database without the inbox yet: «unavailable», not a broken screen (PGRST202, 42883)', async () => {
    for (const [status, code] of [
      [404, 'PGRST202'],
      [404, '42883'],
    ] as const) {
      server.decide = (req) => (req.target === 'rpc/rejected_inbox' ? { status, body: { code, details: null, hint: null, message: 'Could not find the function public.rejected_inbox' } } : 'answer')
      await loadRejectedInbox('t1')
      expect(useRejectedInbox.getState()).toMatchObject({ status: 'unavailable', items: [] })
    }
  })

  it('«Cerrar torneo» counts what the Comité is asked about, and does not wait on a list the server does not have yet', async () => {
    const { openRejectedWrites } = await import('./api')
    const { closeCheck } = await import('../engine/close')
    const { makeSnapshot } = await import('../engine/testing/fixtures')
    const { DEFAULT_SETTINGS } = await import('../engine/settings/presets')
    expect(await openRejectedWrites('t1')).toBe(2)
    server.decide = (req) => (req.target === 'rpc/rejected_inbox' ? { status: 404, body: { code: 'PGRST202', details: null, hint: null, message: 'Could not find the function public.rejected_inbox(p_tournament_id) in the schema cache' } } : 'answer')
    const missing = await openRejectedWrites('t1')
    expect(missing).toBeNull()
    const closed = closeCheck(makeSnapshot({ players: 4 }), DEFAULT_SETTINGS, { openRejected: missing })
    expect(closed.blockers.map((b) => b.kind)).not.toContain('rejectedWrites')
    expect(closed.warnings).toContain(t.closeGate.rejectedUnavailable)
  })

  it('any other failure is the store\'s error, said for people', async () => {
    server.decide = (req) => (req.target === 'rpc/rejected_inbox' ? { status: 500, body: { code: 'XX000', details: null, hint: null, message: 'internal error in rejected_writes' } } : 'answer')
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
    await resolveInboxItem('t1', 'w1', 'apply', 'Beto confirma 6', { strokes: 5, putts: 2, picked_up: false })
    expect(server.wire.filter((r) => r.target === 'rpc/resolve_rejected_write').map((r) => r.body)).toEqual([
      { p_id: 'w1', p_action: 'apply', p_reason: 'Beto confirma 6', p_expect: { strokes: 5, putts: 2, picked_up: false } },
    ])
    expect(ids()).toEqual(['w2'])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 6, putts: 2, picked_up: false, reason: 'Beto confirma 6', entered_by: 'p1' })
    expect(row('w1')).toMatchObject({ status: 'applied', resolved_by: me, resolution_note: 'Beto confirma 6' })
  })

  it('«Descartar» leaves the card as it is', async () => {
    await loadRejectedInbox('t1')
    await resolveInboxItem('t1', 'w2', 'dismiss', 'Ya lo capturó el Comité')
    expect(server.wire.filter((r) => r.target === 'rpc/resolve_rejected_write').map((r) => r.body)).toEqual([{ p_id: 'w2', p_action: 'dismiss', p_reason: 'Ya lo capturó el Comité' }])
    expect(ids()).toEqual(['w1'])
    expect(server.score('p2', 7)).toBeUndefined()
    expect(row('w2')).toMatchObject({ status: 'dismissed', resolution_note: 'Ya lo capturó el Comité' })
  })

  it('a reason too short is refused in the server\'s words, and the row stays', async () => {
    await loadRejectedInbox('t1')
    const e = await resolveInboxItem('t1', 'w1', 'apply', 'ok', { strokes: 5, putts: 2, picked_up: false }).catch((x: unknown) => x)
    expect(humanError(e)).toBe('Escribe el motivo, al menos 3 letras')
    expect(ids()).toEqual(['w1', 'w2'])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 5 })
  })

  it('a row another Comité phone resolved first: refused, and the list read again drops it', async () => {
    await loadRejectedInbox('t1')
    row('w1').status = 'dismissed'
    const e = await resolveInboxItem('t1', 'w1', 'apply', 'Beto confirma 6', { strokes: 5, putts: 2, picked_up: false }).catch((x: unknown) => x)
    expect(humanError(e)).toBe('Esa captura ya estaba resuelta')
    expect(ids()).toEqual(['w2'])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 5 })
  })

  it('the hole changed after the Comité looked (the phone saved 3/3 over the 5/2 it saw): refused, the 3/3 stands, the row stays (A8)', async () => {
    await loadRejectedInbox('t1')
    const seen = seenHole({ strokes: 5, putts: 2, pickedUp: false })
    server.tables.scores = server.tables.scores!.map((r) => (r.player_id === 'p2' && r.hole === 5 ? { ...r, strokes: 3, putts: 3 } : r))
    const e = await resolveInboxItem('t1', 'w1', 'apply', 'Según la vista', seen).catch((x: unknown) => x)
    expect(isStaleHole(e)).toBe(true)
    expect(humanError(e)).toBe('El hoyo cambió mientras lo revisabas; vuelve a mirarlo')
    expect(server.score('p2', 5)).toMatchObject({ strokes: 3, putts: 3 })
    expect(row('w1').status).toBe('open')
    expect(ids()).toEqual(['w1', 'w2'])
  })

  it('an apply never goes without what the Comité saw: the server refuses it', async () => {
    const e = await resolveInboxItem('t1', 'w1', 'apply', 'Sin mirar').catch((x: unknown) => x)
    expect(server.wire.filter((r) => r.target === 'rpc/resolve_rejected_write').map((r) => r.body)).toEqual([{ p_id: 'w1', p_action: 'apply', p_reason: 'Sin mirar', p_expect: null }])
    expect(humanError(e)).toBe('Falta lo que viste en la tarjeta; vuelve a abrir la lista')
    expect(server.score('p2', 5)).toMatchObject({ strokes: 5 })
  })

  it('a bulk dismissal that fails partway, then again: the second time sends only what is left, and a row another phone resolved counts as done', async () => {
    await loadRejectedInbox('t1')
    let down = true
    server.decide = (req) => (down && req.target === 'rpc/resolve_rejected_write' && (req.body as Row).p_id === 'w2' ? { status: 503, body: { code: 'XX000', details: null, hint: null, message: 'upstream' } } : 'answer')
    const first = await dismissInboxItems('t1', ['w1', 'w2'], 'La tarjeta ya tiene ese valor')
    expect(first.done).toBe(1)
    expect(first.failed).toBeTruthy()
    expect(ids()).toEqual(['w2'])
    // Meanwhile another Comité phone dismissed w2; the retry is for the rows as they are now.
    down = false
    row('w2').status = 'dismissed'
    const again = await dismissInboxItems('t1', ['w2'], 'La tarjeta ya tiene ese valor')
    expect(again).toEqual({ done: 1, failed: null })
    expect(ids()).toEqual([])
    expect(row('w1')).toMatchObject({ status: 'dismissed', resolution_note: 'La tarjeta ya tiene ese valor' })
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
    const item = { id: 'w', roundId: 'r1', hole: 5, playerId: 'p2', writerPlayerId: null, reason: 'not_in_group' as const, fields: { strokes: 6 }, base: { strokes: 4, putts: 3, picked_up: false }, createdAt: '' }
    expect(sentValue(item, cur)).toEqual({ strokes: 6, putts: 3, pickedUp: false })
    expect(sentValue({ ...item, base: undefined }, cur)).toEqual({ strokes: 6, putts: 2, pickedUp: false })
  })
  it('«ya coincide» only when all three match: the putts and the pick-up count, not only the strokes', () => {
    const v = { strokes: 5, putts: 2, pickedUp: false }
    expect(sameValue(v, { ...v })).toBe(true)
    expect(sameValue(v, { ...v, putts: 3 })).toBe(false)
    expect(sameValue(v, { ...v, putts: null })).toBe(false)
    expect(sameValue({ strokes: null, putts: 2, pickedUp: true }, { strokes: null, putts: 2, pickedUp: false })).toBe(false)
    expect(sameValue(v, { ...v, strokes: 6 })).toBe(false)
    expect(sameValue(v, null)).toBe(false)
  })
  it('the hole as the Comité saw it, as the server checks it: its three values, or nothing at all', () => {
    expect(seenHole({ strokes: null, putts: 1, pickedUp: true })).toEqual({ strokes: null, putts: 1, picked_up: true })
    expect(seenHole(null)).toEqual({})
  })
})

/**
 * TRUST-19: a change's detail reads as the Comité speaks, never as the database's columns and UUIDs.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { t } from '../i18n/es-MX'
import { changedFields } from './auditDiff'
import { auditNames, fieldLabel, fieldValue, holeValue } from './auditFields'
import { localWhen } from './localWhen'
import { formatMoney } from './money'
import { parseSettings } from '../engine/settings/schema'

const V = t.admin.history.value
const fx = getFixture('full12-live')!
const s = fx.snapshot
const names = auditNames(s)
// The tournament's zone and currency are its settings' (ARCH-06).
const { timezone: tz, currency } = parseSettings(s.tournament.settings)
const show = (key: string, v: unknown, table = 'scores') => fieldValue(key, v, table, names, tz, currency)
const [ana, beto] = s.players
const round = s.rounds[0]!
const group = s.groups[0]!
const course = s.courses[0]!
const tee = course.tees[0]!

describe('what an id names', () => {
  it('a player, a day, a group, a tee, a course, by their names on the boards', () => {
    expect(show('entered_by', ana!.id)).toBe(ana!.displayName)
    expect(show('owner_id', beto!.id, 'calcutta_lots')).toBe(beto!.displayName)
    expect(show('round_id', round.id)).toBe(V.day(round.number))
    expect(show('group_id', group.id, 'group_members')).toBe(V.group(group.number))
    expect(show('default_tee_id', tee.id, 'players')).toBe(V.tee(course.name, tee.name))
    expect(show('course_id', course.id, 'rounds')).toBe(course.name)
  })
  it('a pair by its name, or its two players; a team and a lot by what they are', () => {
    const pair = { id: 'pr1', name: null, player1Id: ana!.id, player2Id: beto!.id, kind: 'AD', pickedByHonoree: false, drawnAt: null }
    const named = auditNames({ ...s, pairs: [pair, { ...pair, id: 'pr2', name: 'Los novios' }], teams: [{ id: 'tm1', name: null, number: 3, playerIds: [], drawnAt: null }], calcuttaLots: [{ id: 'l1', playerId: ana!.id, lotNumber: 4, status: 'sold', price: 750, ownerId: beto!.id, soldAt: null }] })
    const val = (key: string, v: string) => fieldValue(key, v, 'x', named, tz, currency)
    expect(val('pair_id', 'pr1')).toBe(t.common.andList([ana!.displayName, beto!.displayName]))
    expect(val('pair_id', 'pr2')).toBe('Los novios')
    expect(val('team_id', 'tm1')).toBe(V.team(3))
    expect(val('lot_id', 'l1')).toBe(V.lot(4, ana!.displayName))
  })
  it('an id the boards no longer hold reads as another record, never as a UUID', () => {
    expect(show('player_id', '6b0f1f6e-0000-4000-8000-000000000000')).toBe(V.other)
    expect(show('round_id', 42)).toBe(V.other)
  })
})

describe('how a value reads', () => {
  it('money, moments in the tournament’s zone, a tee time, flags, images', () => {
    expect(show('amount', 2500, 'payments')).toBe(formatMoney(2500, 'MXN'))
    expect(show('signed_at', '2027-04-09T22:15:00Z', 'card_signatures')).toBe(localWhen('2027-04-09T22:15:00Z', tz))
    expect(show('tee_time', '09:10:00', 'groups')).toBe('09:10')
    expect(show('picked_up', true)).toBe(V.yes)
    expect(show('disputed', false)).toBe(V.no)
    expect(show('avatar_url', 'https://x.supabase.co/storage/v1/object/public/a.png', 'players')).toBe(V.image)
  })
  it('a hole’s earlier value, with who wrote it; what can’t be said in a line says it changed', () => {
    expect(show('previous', { strokes: 6, putts: 2, picked_up: false, entered_by: beto!.id })).toBe(V.previous('6 golpes, 2 putts', beto!.displayName))
    expect(holeValue({ strokes: null, putts: 1, picked_up: true })).toBe(t.card.history.pickedUp(1))
    expect(show('settings', { games: [] }, 'tournaments')).toBe(V.changed)
    expect(show('estimate_inputs', [1, 2, 3], 'players')).toBe(V.changed)
  })
  it('a status in each table’s own words, and a handicap’s source', () => {
    expect(show('status', 'live', 'tournaments')).toBe(t.status.live)
    expect(show('status', 'finished', 'rounds')).toBe(t.roundStatus.finished)
    expect(show('status', 'sold', 'calcutta_lots')).toBe(V.lotStatus.sold)
    expect(show('handicap_source', 'estimate', 'players')).toBe(V.source.estimate)
  })
  it('a PIN line says which PIN, never its digits; an unlock is a flag; a file an image (DB-13)', () => {
    expect(show('pin', 'old', 'player_pins')).toBe(V.pin.old)
    expect(show('pin', 'new', 'player_pins')).toBe(V.pin.new)
    expect(show('pin', '1234', 'player_pins')).toBe(V.changed)
    expect(show('locked', true, 'player_pins')).toBe(V.yes)
    expect(show('url', 'https://x.test/a.jpg', 'photos')).toBe(V.image)
    expect(fieldLabel('nets')).toBe('Netos publicados')
  })
  it('nothing reads as a dash; a column with no name of its own shows as it is', () => {
    expect(show('reason', null)).toBe(V.none)
    expect(show('note', '', 'payments')).toBe(V.none)
    expect(show('playing_hcp', 13, 'handicap_overrides')).toBe('13')
    expect(fieldLabel('strokes')).toBe('Golpes')
    expect(fieldLabel('entered_by')).toBe('Capturó')
    expect(fieldLabel('some_new_column')).toBe('some_new_column')
  })
})

describe('the bookkeeping stays out', () => {
  it('a score’s version, device and mutation, the row’s tournament, a generated card or source, a decision’s call', () => {
    const f = changedFields({
      action: 'UPDATE',
      before: { strokes: 6, version: 1, device_id: 'd1', mutation_id: 'm1', tournament_id: 't', card_id: 'c', source: 'group', call_id: 'k' },
      after: { strokes: 5, version: 2, device_id: 'd2', mutation_id: 'm2', tournament_id: 't2', card_id: 'c2', source: 'comite', call_id: 'k2' },
    })
    expect(f.map((x) => x.key)).toEqual(['strokes'])
  })
})

/**
 * A change's fields as the Comité reads them in Historial (TRUST-19): each column by its Spanish name, each id as
 * what it names on the boards (a player, a day, a group, a pair, a team, a lot, a tee, a course), money as money,
 * moments in the tournament's own zone, a hole's earlier value as «5 golpes, 2 putts», and a flag as «sí» or «no».
 * The detail used to list the database's own columns with their raw values, a player as a UUID. An id the boards
 * no longer hold (a row since deleted) reads «otro registro»; a column with no name of its own shows as it is.
 */
import type { Snapshot } from '../engine/types'
import { t } from '../i18n/es-MX'
import { localWhen } from './localWhen'
import { formatMoney } from './money'

const H = t.admin.history
const V = H.value

type Kind =
  | 'player'
  | 'round'
  | 'group'
  | 'pair'
  | 'team'
  | 'lot'
  | 'tee'
  | 'course'
  | 'money'
  | 'moment'
  | 'clock'
  | 'flag'
  | 'image'
  | 'previous'
  | 'opaque'
  | 'status'
  | 'source'
  | 'pin'

const KIND: Record<string, Kind> = {
  player_id: 'player',
  entered_by: 'player',
  decided_by: 'player',
  signed_by: 'player',
  bidder_id: 'player',
  owner_id: 'player',
  last_holed_player_id: 'player',
  player1_id: 'player',
  player2_id: 'player',
  from_player_id: 'player',
  to_player_id: 'player',
  banker_player_id: 'player',
  by: 'player',
  round_id: 'round',
  current_round_id: 'round',
  group_id: 'group',
  pair_id: 'pair',
  team_id: 'team',
  lot_id: 'lot',
  tee_id: 'tee',
  default_tee_id: 'tee',
  course_id: 'course',
  amount: 'money',
  price: 'money',
  at: 'moment',
  signed_at: 'moment',
  sold_at: 'moment',
  drawn_at: 'moment',
  claimed_at: 'moment',
  released_at: 'moment',
  voided_at: 'moment',
  handicaps_locked_at: 'moment',
  adults_confirmed_at: 'moment',
  done_at: 'moment',
  tee_time: 'clock',
  picked_up: 'flag',
  disputed: 'flag',
  paid: 'flag',
  is_honoree: 'flag',
  is_admin: 'flag',
  picked_by_honoree: 'flag',
  counts_for_stats: 'flag',
  quick: 'flag',
  is_protected: 'flag',
  locked: 'flag',
  avatar_url: 'image',
  logo_url: 'image',
  url: 'image',
  previous: 'previous',
  settings: 'opaque',
  estimate_inputs: 'opaque',
  status: 'status',
  handicap_source: 'source',
  pin: 'pin',
}

/** What the ids in a change name, read from the boards on screen. */
export function auditNames(s: Snapshot | null | undefined) {
  const players = new Map((s?.players ?? []).map((p) => [p.id, p.displayName]))
  const name = (id: string) => players.get(id) ?? null
  return {
    player: name,
    round: (id: string) => {
      const r = s?.rounds.find((x) => x.id === id)
      return r ? V.day(r.number) : null
    },
    group: (id: string) => {
      const g = s?.groups.find((x) => x.id === id)
      return g ? V.group(g.number) : null
    },
    pair: (id: string) => {
      const p = s?.pairs.find((x) => x.id === id)
      return p ? (p.name ?? t.common.andList([name(p.player1Id) ?? '?', name(p.player2Id) ?? '?'])) : null
    },
    team: (id: string) => {
      const x = s?.teams.find((y) => y.id === id)
      return x ? (x.name ?? V.team(x.number)) : null
    },
    lot: (id: string) => {
      const l = s?.calcuttaLots.find((x) => x.id === id)
      return l ? V.lot(l.lotNumber, name(l.playerId)) : null
    },
    tee: (id: string) => {
      for (const c of s?.courses ?? []) {
        const tee = c.tees.find((x) => x.id === id)
        if (tee) return V.tee(c.name, tee.name)
      }
      return null
    },
    course: (id: string) => s?.courses.find((c) => c.id === id)?.name ?? null,
  }
}
export type AuditNames = ReturnType<typeof auditNames>

/** A column's name in Spanish, or the column itself when it has none. */
export function fieldLabel(key: string): string {
  return H.field[key] ?? key
}

/** A hole's value as a score row holds it (strokes, putts, picked_up): «5 golpes, 2 putts», «levantó». */
export function holeValue(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return r.picked_up === true
    ? t.card.history.pickedUp(num(r.putts))
    : t.card.history.value(num(r.strokes), num(r.putts))
}

function statusValue(table: string, v: string): string {
  if (table === 'tournaments') return (t.status as Record<string, string>)[v] ?? v
  if (table === 'rounds') return (t.roundStatus as Record<string, string>)[v] ?? v
  if (table === 'calcutta_lots') return V.lotStatus[v] ?? v
  return v
}

/** A scalar's text; an object reads as its JSON, never «[object Object]». */
const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint'
      ? String(v)
      : JSON.stringify(v)

/** One column's value, as the Comité reads it: money in the tournament's currency, moments in its zone (ARCH-06). */
export function fieldValue(
  key: string,
  v: unknown,
  table: string,
  names: AuditNames,
  timeZone: string,
  cur: string,
): string {
  if (v == null || v === '') return V.none
  const id = typeof v === 'string' ? v : null
  const named = (look: (id: string) => string | null) => (id ? look(id) : null) ?? V.other
  switch (KIND[key]) {
    case 'player':
      return named(names.player)
    case 'round':
      return named(names.round)
    case 'group':
      return named(names.group)
    case 'pair':
      return named(names.pair)
    case 'team':
      return named(names.team)
    case 'lot':
      return named(names.lot)
    case 'tee':
      return named(names.tee)
    case 'course':
      return named(names.course)
    case 'money':
      return typeof v === 'number' ? formatMoney(v, cur) : text(v)
    case 'moment':
      return id ? localWhen(id, timeZone) : text(v)
    case 'clock':
      return id ? id.slice(0, 5) : text(v)
    case 'flag':
      return v === true ? V.yes : V.no
    case 'image':
      return V.image
    case 'previous': {
      const who =
        typeof (v as Record<string, unknown>).entered_by === 'string'
          ? names.player((v as Record<string, string>).entered_by!)
          : null
      return V.previous(holeValue(v) ?? V.none, who)
    }
    case 'opaque':
      return V.changed
    case 'status':
      return statusValue(table, text(v))
    case 'source':
      return V.source[text(v)] ?? text(v)
    case 'pin':
      return V.pin[text(v)] ?? V.changed
    case undefined:
      break
  }
  if (typeof v === 'boolean') return v ? V.yes : V.no
  if (typeof v === 'object') return V.changed
  return text(v)
}

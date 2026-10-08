/**
 * REL-11, PERF-07 (the PR #92 verifier's property test, kept): random
 * sequences of inserts, updates and deletes across every applied table are
 * written to the in-memory server and delivered as postgres_changes payloads
 * shaped like Realtime's (`new` = the whole row, `old` = the primary key for
 * a delete), with another tournament's changes mixed in and slow reloads in
 * flight. What the store computes from the events must be exactly what it
 * computes from a fresh fetch of the same rows: the same money, standings,
 * snake, feed and stats, and the same lists in the same order.
 *   POLO_PROP_SEEDS=80 POLO_PROP_OPS=60 npx vitest run src/data/tournamentStore.property.test.ts
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'
import type { Row } from './mappers'
import type { Snapshot } from '../engine/types'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament } = await import('./tournamentStore')
const store = () => useTournament.getState()

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PK: Record<string, string[]> = {
  scores: ['id'],
  snake_tiebreaks: ['round_id', 'group_id', 'hole'],
  card_signatures: ['round_id', 'pair_id'],
  hole_awards: ['round_id', 'game_id', 'hole', 'player_id'],
  handicap_overrides: ['round_id', 'player_id'],
  round_tees: ['round_id', 'player_id'],
  payments: ['id'],
  calcutta_lots: ['id'],
  calcutta_bids: ['id'],
  calcutta_buybacks: ['lot_id'],
  game_entries: ['tournament_id', 'game_id', 'player_id'],
  game_results: ['tournament_id', 'game_id', 'player_id'],
}
const pkOf = (table: string, row: Row) => Object.fromEntries(PK[table]!.map((k) => [k, row[k]]))

type Emit = (table: string, payload: Record<string, unknown>) => void

/** One random write on the server, and the event Realtime would deliver for it. */
function makeOps(s: Snapshot, TID: string, r: () => number, emit: Emit) {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  // The server's clock runs past every row it holds (scores_touch stamps each write now()).
  let clock = Math.max(Date.parse('2027-04-09T12:00:00Z'), ...s.scores.map((x) => Date.parse(x.updatedAt ?? '') || 0)) + 1000
  const ts = () => new Date((clock += int(1, 5000))).toISOString().replace('Z', '+00:00')
  let n = 0
  const nid = (p: string) => `${p}-${++n}-${Math.floor(r() * 1e9)}`
  const T = () => server.tables
  const rounds = s.rounds.map((x) => x.id)
  const groupsOf = (rid: string) => s.groups.filter((g) => g.roundId === rid)
  const players = s.players.map((p) => p.id)
  const tees = s.courses.flatMap((c) => c.tees.map((t) => ({ id: t.id, courseId: c.id })))
  const games = ((s.tournament.settings as { games?: Array<{ id: string; type: string }> }).games ?? [])
  const contest = games.filter((g) => g.type === 'contest').map((g) => g.id)
  const custom = games.filter((g) => g.type === 'custom').map((g) => g.id)
  const listed = games.map((g) => g.id)

  const ins = (table: string, row: Row) => {
    T()[table]!.push(row)
    emit(table, { eventType: 'INSERT', new: structuredClone(row), old: {}, errors: null })
  }
  const upd = (table: string, row: Row) => emit(table, { eventType: 'UPDATE', new: structuredClone(row), old: {}, errors: null })
  const del = (table: string, row: Row) => {
    T()[table] = T()[table]!.filter((x) => x !== row)
    emit(table, { eventType: 'DELETE', new: {}, old: pkOf(table, row), errors: null })
  }
  const find = (table: string, where: Row) => T()[table]!.find((x) => Object.entries(where).every(([k, v]) => x[k] === v))

  const ops: Array<[number, () => void]> = [
    [
      40,
      () => {
        // A hole saved (upsert on round, player, hole).
        const rid = pick(rounds)
        const g = groupsOf(rid).length ? pick(groupsOf(rid)) : null
        const pid = g ? pick(g.playerIds) : pick(players)
        const hole = int(1, 18)
        const pickedUp = r() < 0.08
        const strokes = pickedUp ? (r() < 0.5 ? null : int(5, 9)) : int(2, 9)
        const putts = r() < 0.1 ? null : Math.min(int(0, 4), strokes ?? 4)
        const disputed = r() < 0.1
        const fields = { strokes, putts, picked_up: pickedUp, entered_by: g ? pick(g.playerIds) : pid, client_ts: ts(), updated_at: ts(), disputed, previous: disputed ? { strokes: 4, putts: 2, picked_up: false } : null }
        const cur = find('scores', { round_id: rid, player_id: pid, hole })
        if (cur) {
          Object.assign(cur, fields)
          upd('scores', cur)
        } else ins('scores', { id: nid('score'), round_id: rid, player_id: pid, hole, reason: null, ...fields })
      },
    ],
    [
      2,
      () => {
        const cur = T().scores!.length ? pick(T().scores!) : null
        if (cur) del('scores', cur)
      },
    ],
    [
      6,
      () => {
        const rid = pick(rounds)
        if (!groupsOf(rid).length) return
        const g = pick(groupsOf(rid))
        const hole = int(1, 18)
        const cur = find('snake_tiebreaks', { round_id: rid, group_id: g.id, hole })
        if (cur && r() < 0.35) return del('snake_tiebreaks', cur)
        if (cur) {
          cur.last_holed_player_id = pick(g.playerIds)
          upd('snake_tiebreaks', cur)
        } else ins('snake_tiebreaks', { round_id: rid, group_id: g.id, hole, last_holed_player_id: pick(g.playerIds), decided_by: null, created_at: ts() })
      },
    ],
    [
      4,
      () => {
        if (!s.pairs.length) return
        const rid = pick(rounds)
        const pair = pick(s.pairs)
        const cur = find('card_signatures', { round_id: rid, pair_id: pair.id })
        if (cur) del('card_signatures', cur)
        else ins('card_signatures', { round_id: rid, pair_id: pair.id, signed_by: pick(players), signed_at: ts() })
      },
    ],
    [
      4,
      () => {
        const rid = pick(rounds)
        const pid = pick(players)
        const cur = find('handicap_overrides', { round_id: rid, player_id: pid })
        if (cur && r() < 0.4) return del('handicap_overrides', cur)
        if (cur) {
          cur.playing_hcp = int(0, 36)
          upd('handicap_overrides', cur)
        } else ins('handicap_overrides', { round_id: rid, player_id: pid, playing_hcp: int(0, 36), reason: 'ajuste', by: null, at: ts() })
      },
    ],
    [
      3,
      () => {
        const rid = pick(rounds)
        const courseId = s.rounds.find((x) => x.id === rid)!.courseId
        const options = tees.filter((t) => t.courseId === courseId)
        if (!options.length) return
        const pid = pick(players)
        const cur = find('round_tees', { round_id: rid, player_id: pid })
        if (cur && r() < 0.4) return del('round_tees', cur)
        if (cur) {
          cur.tee_id = pick(options).id
          upd('round_tees', cur)
        } else ins('round_tees', { round_id: rid, player_id: pid, tee_id: pick(options).id })
      },
    ],
    [
      8,
      () => {
        // set_payment_paid: an upsert on (tournament, kind, from, to).
        const kind = pick(['entry', 'calcutta', 'payout', 'other'] as const)
        const from = kind === 'payout' ? null : pick(players)
        const to = kind === 'payout' ? pick(players) : null
        const cur = find('payments', { tournament_id: TID, kind, from_player_id: from, to_player_id: to })
        if (cur && r() < 0.15) return del('payments', cur)
        if (cur) {
          cur.paid = !cur.paid
          cur.amount = pick([cur.amount, 2500, 1200])
          upd('payments', cur)
        } else ins('payments', { id: nid('pay'), tournament_id: TID, from_player_id: from, to_player_id: to, amount: pick([2500, 1200, 300]), kind, paid: r() < 0.7, note: null, created_at: ts() })
      },
    ],
    [
      6,
      () => {
        const lots = T().calcutta_lots!.filter((l) => l.tournament_id === TID)
        if (!lots.length) return
        const lot = pick(lots)
        if (r() < 0.05) {
          // A lot deleted: its bids and buyback go with it (cascade, parent first in the WAL).
          del('calcutta_lots', lot)
          for (const b of T().calcutta_bids!.filter((x) => x.lot_id === lot.id)) del('calcutta_bids', b)
          for (const b of T().calcutta_buybacks!.filter((x) => x.lot_id === lot.id)) del('calcutta_buybacks', b)
          return
        }
        if (lot.status === 'sold' && r() < 0.5) Object.assign(lot, { status: 'open', price: null, owner_id: null, sold_at: null })
        else Object.assign(lot, { status: 'sold', price: 250 * int(1, 12), owner_id: pick(players), sold_at: ts() })
        upd('calcutta_lots', lot)
      },
    ],
    [
      8,
      () => {
        const lots = T().calcutta_lots!.filter((l) => l.tournament_id === TID)
        if (!lots.length) return
        const lot = pick(lots)
        const bids = T().calcutta_bids!.filter((b) => b.lot_id === lot.id)
        if (bids.length && r() < 0.35) return del('calcutta_bids', pick(bids))
        ins('calcutta_bids', { id: nid('bid'), lot_id: lot.id, bidder_id: pick(players), amount: 250 * int(1, 16), created_at: ts() })
      },
    ],
    [
      4,
      () => {
        const lots = T().calcutta_lots!.filter((l) => l.tournament_id === TID)
        if (!lots.length) return
        const lot = pick(lots)
        const cur = find('calcutta_buybacks', { lot_id: lot.id })
        if (cur && r() < 0.35) return del('calcutta_buybacks', cur)
        const pct = pick([25, 50, 10])
        if (cur) {
          Object.assign(cur, { pct, amount: Math.round(((lot.price ?? 1000) * pct) / 100), paid: r() < 0.5 })
          upd('calcutta_buybacks', cur)
        } else ins('calcutta_buybacks', { lot_id: lot.id, pct, amount: Math.round(((lot.price ?? 1000) * pct) / 100), paid: false })
      },
    ],
    [
      3,
      () => {
        if (!listed.length) return
        const game = pick(listed)
        const pid = pick(players)
        const cur = find('game_entries', { tournament_id: TID, game_id: game, player_id: pid })
        if (cur) del('game_entries', cur)
        else ins('game_entries', { tournament_id: TID, game_id: game, player_id: pid, created_at: ts() })
      },
    ],
    [
      3,
      () => {
        // setGameResults: delete the game's results, insert the winners (numeric share as Postgres prints it).
        if (!custom.length) return
        const game = pick(custom)
        for (const x of T().game_results!.filter((x) => x.tournament_id === TID && x.game_id === game)) del('game_results', x)
        const winners = [...new Set([pick(players), pick(players)])]
        for (const pid of winners) ins('game_results', { tournament_id: TID, game_id: game, player_id: pid, share: pick(['1', '0.5', '2']), created_at: ts() })
      },
    ],
    [
      4,
      () => {
        if (!contest.length) return
        const rid = pick(rounds)
        if (!groupsOf(rid).length) return
        const g = pick(groupsOf(rid))
        const game = pick(contest)
        const hole = int(1, 18)
        // The outbox's award push: delete the group's answer for the hole, insert the winners.
        for (const x of T().hole_awards!.filter((x) => x.round_id === rid && x.game_id === game && x.hole === hole && x.group_id === g.id)) del('hole_awards', x)
        if (r() < 0.7) {
          const pid = pick(g.playerIds)
          if (!find('hole_awards', { round_id: rid, game_id: game, hole, player_id: pid })) ins('hole_awards', { round_id: rid, group_id: g.id, hole, game_id: game, player_id: pid, decided_by: null, created_at: ts() })
        }
      },
    ],
    [
      5,
      () => {
        // Another tenant: an account in two tournaments hears both (inserts and updates pass RLS for it; deletes pass for everyone).
        const k = int(0, 4)
        if (k === 0) ins('payments', { id: nid('pay-other'), tournament_id: 'other-t', from_player_id: 'op1', to_player_id: null, amount: 999, kind: 'entry', paid: true, note: null, created_at: ts() })
        else if (k === 1) emit('calcutta_lots', { eventType: 'UPDATE', new: { id: nid('lot-other'), tournament_id: 'other-t', player_id: 'op1', lot_number: 1, status: 'sold', price: 5000, owner_id: 'op2', sold_at: ts() }, old: {}, errors: null })
        else if (k === 2) emit('game_entries', { eventType: 'INSERT', new: { tournament_id: 'other-t', game_id: listed[0] ?? 'skins', player_id: 'op1', created_at: ts() }, old: {}, errors: null })
        else if (k === 3) emit('card_signatures', { eventType: 'DELETE', new: {}, old: { round_id: 'other-round', pair_id: s.pairs[0]?.id ?? 'x' }, errors: null })
        else emit('calcutta_bids', { eventType: 'DELETE', new: {}, old: { id: nid('bid-other') }, errors: null })
      },
    ],
  ]
  const total = ops.reduce((a, [w]) => a + w, 0)
  return () => {
    let x = r() * total
    for (const [w, f] of ops) {
      if ((x -= w) < 0) return f()
    }
  }
}

/** Paths where two values differ (first few). */
function diffPaths(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length > 8) return out
  if (JSON.stringify(a) === JSON.stringify(b)) return out
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
      out.push(`${path}: length ${a.length} vs ${b.length}`)
      return out
    }
    for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out)
    return out
  }
  out.push(`${path}: applied=${JSON.stringify(a)?.slice(0, 200)} fresh=${JSON.stringify(b)?.slice(0, 200)}`)
  return out
}
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null })
})

const FIXTURES = ['full12-live', 'friends8', 'auction12']
const SEEDS = Number(process.env.POLO_PROP_SEEDS ?? 12)
const OPS = Number(process.env.POLO_PROP_OPS ?? 40)

describe('applied events vs. a fresh fetch of the same rows', () => {
  for (const name of FIXTURES) {
    it(`${name}: ${SEEDS} random sequences of ${OPS} writes`, async () => {
      const fx = getFixture(name)!
      const TID = fx.snapshot.tournament.id
      for (let seed = 1; seed <= SEEDS; seed++) {
        server = fakeSupabase(snapshotToRows(fx.snapshot))
        await store().load(TID)
        const ch = server.channels.at(-1)!
        ch.status!('SUBSCRIBED')
        await vi.waitFor(() => expect(server.requests.filter((x) => x.table === 'tournaments').length).toBe(2))
        vi.useFakeTimers()
        const r = rng(seed * 7919 + name.length)
        const emit: Emit = (table, payload) => ch.bindings.get(table)!(payload)
        const step = makeOps(fx.snapshot, TID, r, emit)
        let held: { h: ReturnType<FakeSupabase['hold']>; p: Promise<void>; left: number } | null = null
        for (let i = 0; i < OPS; i++) {
          step()
          // Sometimes a reload goes out (the phone woke up) and is slow while writes keep landing.
          if (!held && r() < 0.06) {
            const h = server.hold()
            held = { h, p: store().reload(), left: 1 + Math.floor(r() * 6) }
            await h.received
          } else if (held && --held.left <= 0) {
            held.h.release()
            await held.p
            held = null
          }
          await vi.advanceTimersByTimeAsync(Math.floor(r() * 90))
        }
        if (held) {
          held.h.release()
          await held.p
        }
        await vi.advanceTimersByTimeAsync(2000)
        vi.useRealTimers()
        const applied = store().data!
        // A fresh fetch of the same rows, from a clean store.
        store().unsubscribe()
        useTournament.setState({ tournamentId: null, data: null, source: null })
        await store().load(TID)
        const fresh = store().data!
        const cmp: Record<string, [unknown, unknown]> = {
          money: [applied.state.money, fresh.state.money],
          prizes: [applied.state.prizes, fresh.state.prizes],
          modules: [applied.state.modules, fresh.state.modules],
          games: [applied.state.games, fresh.state.games],
          core: [applied.state.core, fresh.state.core],
          flags: [applied.state.flags, fresh.state.flags],
          feed: [applied.state.feed, fresh.state.feed],
          stats: [applied.state.stats, fresh.state.stats],
          rows: [applied.base, fresh.base],
        }
        for (const [k, [a, b]] of Object.entries(cmp)) {
          expect(JSON.stringify(a) === JSON.stringify(b), `${name} seed ${seed} ${k}: ${diffPaths(a, b).join(' ;; ')}`).toBe(true)
        }
        store().unsubscribe()
      }
    }, 600_000)
  }
})

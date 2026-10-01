/**
 * QA-07: the mappers turn the server's rows into the engine's types. The rows
 * below are written the way PostgREST returns them: snake_case, every column
 * the table has, timestamps and times as Postgres prints them, nulls where
 * the column allows them. Numeric columns are the exception: PostgREST sends
 * them as JSON numbers (`14.0` arrives as 14), and these rows carry them as
 * text (`base_hcp: "14.0"`), the stricter input, since a mapper that forgot
 * to convert would pass a number through unharmed. Each numeric column is
 * also mapped from a number. A slip here (a pick-up dropped, a handicap read
 * as 0) gives a wrong board with a perfect engine, so the last test runs the
 * mapped rows through it.
 *
 * The round trip of every design fixture through the store is in
 * snapshot.golden.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../engine/computeTournament'
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import { parseSettings } from '../engine/settings/schema'
import { makeSnapshot, PAR_72 } from '../engine/testing/fixtures'
import type { Snapshot } from '../engine/types'
import {
  mapBid,
  mapBuyback,
  mapCardSignature,
  mapCourse,
  mapGameEntry,
  mapGameResult,
  mapGroup,
  mapHandicapOverride,
  mapHoleAward,
  mapLot,
  mapPair,
  mapPayment,
  mapPlayer,
  mapRound,
  mapRoundTee,
  mapScore,
  mapSnakeTiebreak,
  mapTeam,
  mapTournament,
  type Row,
} from './mappers'

/** uuid-shaped ids, readable in the test: id(11) = 00000000-0000-4000-8000-000000000011. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = id(1)
const COURSE = id(2)
const BLANCAS = id(3)
const ROJAS = id(4)
const ROUND = id(5)
const GROUP = id(6)
const ANA = id(11)
const BETO = id(12)
const CHUY = id(13)
const ACCOUNT = id(99)
const CREATED = '2026-09-27T18:03:11.482913+00:00'

const TOURNAMENT: Row = {
  id: T,
  slug: 'ensayo-cabos',
  name: 'Ensayo Los Cabos',
  tagline: 'Antes del viaje',
  logo_url: 'https://example.supabase.co/storage/v1/object/public/tournament-assets/logo.png?v=1727460000000',
  accent_color: '#0f6e77',
  join_code: 'K7M2PQ',
  status: 'live',
  current_round_id: ROUND,
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  banker_player_id: ANA,
  timezone: 'America/Mazatlan',
  currency: 'MXN',
  created_by: ACCOUNT,
  created_at: CREATED,
  counts_for_stats: false,
  quick: false,
  crew_id: id(90),
  is_protected: false,
}

const playerRow = (over: Row): Row => ({
  tournament_id: T,
  tier: null,
  base_hcp: '18.0',
  handicap_source: 'manual',
  handicap_index: null,
  estimate_inputs: null,
  default_tee_id: BLANCAS,
  is_honoree: false,
  is_admin: false,
  avatar_url: null,
  form_guide: null,
  created_at: CREATED,
  profile_id: null,
  profile_status: null,
  ...over,
})

const PLAYERS: Row[] = [
  // The Comité's number, used as is.
  playerRow({ id: ANA, full_name: 'Ana Beltrán', display_name: 'Ana', tier: 'A', base_hcp: '14.0', is_honoree: true, is_admin: true, form_guide: 'Viene de 88 y 91', sort_order: 1, profile_id: ACCOUNT, profile_status: 'confirmed' }),
  // A WHS index: converted for the tee he plays.
  playerRow({ id: BETO, full_name: 'Alberto Cárdenas', display_name: 'Beto', base_hcp: '18.0', handicap_source: 'index', handicap_index: '8.1', avatar_url: 'https://example.supabase.co/a/beto.jpg', sort_order: 2 }),
  // An estimate from three gross scores, rating/slope/par not captured (§13b-E).
  playerRow({
    id: CHUY,
    full_name: 'Jesús Duarte',
    display_name: 'Chuy',
    base_hcp: '18.0',
    handicap_source: 'estimate',
    estimate_inputs: [
      { gross: 75, rating: null, slope: null, par: null },
      { gross: 82, rating: null, slope: null, par: null },
      { gross: 90, rating: null, slope: null, par: null },
    ],
    sort_order: 3,
  }),
]

const COURSE_ROW: Row = {
  id: COURSE,
  name: 'Quivira Los Cabos',
  location: 'Cabo San Lucas, BCS',
  source: 'golfcourseapi',
  external_id: 'mz9gqcpj',
  imported_at: CREATED,
  created_by: ACCOUNT,
  created_at: CREATED,
  attribution: null,
  website: null,
  latitude: '22.872100',
  longitude: '-109.902300',
}
// Out of order on purpose, with a tee of another course mixed in.
const TEES: Row[] = [
  { id: ROJAS, course_id: COURSE, name: 'Rojas', color: 'red', rating: null, slope: null, par_total: 72, gender: 'female', sort_order: 1 },
  { id: id(7), course_id: id(8), name: 'Negras', color: 'black', rating: '74.1', slope: 142, par_total: 72, gender: null, sort_order: 0 },
  { id: BLANCAS, course_id: COURSE, name: 'Blancas', color: 'white', rating: '71.2', slope: 128, par_total: 72, gender: 'male', sort_order: 0 },
]
const HOLES: Row[] = [
  ...PAR_72.map(([par, si], i) => ({ tee_id: BLANCAS, number: i + 1, par, stroke_index: si, yards: 320 + 10 * i })).reverse(),
  ...PAR_72.map(([par, si], i) => ({ tee_id: ROJAS, number: i + 1, par, stroke_index: si, yards: null })),
  { tee_id: id(7), number: 1, par: 5, stroke_index: 1, yards: 560 },
]

const ROUND_ROW: Row = { id: ROUND, tournament_id: T, number: 1, date: '2027-04-10', course_id: COURSE, holes: 18, status: 'live' }
const GROUP_ROW: Row = { id: GROUP, round_id: ROUND, number: 1, tee_time: '09:10:00', start_hole: 10 }
const MEMBERS: Row[] = [
  { group_id: GROUP, player_id: ANA },
  { group_id: id(60), player_id: id(61) },
  { group_id: GROUP, player_id: BETO },
  { group_id: GROUP, player_id: CHUY },
]

const scoreRow = (over: Row): Row => ({
  round_id: ROUND,
  putts: 2,
  picked_up: false,
  client_ts: '2027-04-10T16:41:59.880Z',
  updated_at: '2027-04-10T16:42:07.123456+00:00',
  disputed: false,
  previous: null,
  reason: null,
  ...over,
})
const SCORES: Row[] = [
  scoreRow({ id: id(201), player_id: ANA, hole: 1, strokes: 5, entered_by: BETO }),
  // «Levantó»: no strokes, no putts.
  scoreRow({ id: id(202), player_id: ANA, hole: 5, strokes: null, putts: null, picked_up: true, entered_by: BETO }),
  // Another phone overwrote it: the trigger keeps what it replaced.
  scoreRow({
    id: id(203),
    player_id: BETO,
    hole: 1,
    strokes: 4,
    putts: 1,
    entered_by: ANA,
    disputed: true,
    previous: { strokes: 5, putts: 2, picked_up: false, entered_by: CHUY, updated_at: '2027-04-10T16:40:00+00:00' },
  }),
  scoreRow({ id: id(204), player_id: CHUY, hole: 1, strokes: 6, putts: 3, entered_by: ANA }),
]

describe('mappers: rows as PostgREST returns them → the engine’s types (QA-07)', () => {
  it('a tournament: camelCase, the settings passed through raw, the columns 0015–0018 added read', () => {
    const t = mapTournament(TOURNAMENT)
    expect(t).toEqual({
      id: T,
      slug: 'ensayo-cabos',
      name: 'Ensayo Los Cabos',
      tagline: 'Antes del viaje',
      logoUrl: TOURNAMENT.logo_url,
      accentColor: '#0f6e77',
      joinCode: 'K7M2PQ',
      status: 'live',
      currentRoundId: ROUND,
      bankerPlayerId: ANA,
      settings: TOURNAMENT.settings,
      timezone: 'America/Mazatlan',
      currency: 'MXN',
      countsForStats: false,
      quick: false,
      crewId: id(90),
    })
    // Parsed by the store, not here: a broken settings object must reach parseSettings to be reported.
    expect(t.settings).toBe(TOURNAMENT.settings)
  })

  it('players: numeric text becomes numbers ("14.0" → 14, "8.1" → 8.1), the estimate inputs as stored, other columns left out', () => {
    expect(PLAYERS.map(mapPlayer)).toEqual([
      {
        id: ANA,
        fullName: 'Ana Beltrán',
        displayName: 'Ana',
        tier: 'A',
        baseHcp: 14,
        handicapSource: 'manual',
        handicapIndex: null,
        estimateInputs: null,
        defaultTeeId: BLANCAS,
        isHonoree: true,
        isAdmin: true,
        avatarUrl: null,
        formGuide: 'Viene de 88 y 91',
        sortOrder: 1,
      },
      {
        id: BETO,
        fullName: 'Alberto Cárdenas',
        displayName: 'Beto',
        tier: null,
        baseHcp: 18,
        handicapSource: 'index',
        handicapIndex: 8.1,
        estimateInputs: null,
        defaultTeeId: BLANCAS,
        isHonoree: false,
        isAdmin: false,
        avatarUrl: 'https://example.supabase.co/a/beto.jpg',
        formGuide: null,
        sortOrder: 2,
      },
      {
        id: CHUY,
        fullName: 'Jesús Duarte',
        displayName: 'Chuy',
        tier: null,
        baseHcp: 18,
        handicapSource: 'estimate',
        handicapIndex: null,
        estimateInputs: PLAYERS[2]!.estimate_inputs,
        defaultTeeId: BLANCAS,
        isHonoree: false,
        isAdmin: false,
        avatarUrl: null,
        formGuide: null,
        sortOrder: 3,
      },
    ])
    // PostgREST's own form, JSON numbers, maps the same.
    expect(mapPlayer({ ...PLAYERS[1]!, base_hcp: 18, handicap_index: 8.1 })).toEqual(mapPlayer(PLAYERS[1]!))
    expect(mapPlayer({ ...PLAYERS[0]!, base_hcp: '0.0' }).baseHcp).toBe(0)
  })

  it('a base handicap with a decimal keeps it ("21.9" and 21.9 → 21.9), and the engine starts from it unchanged', () => {
    // numeric(4, 1): the Comité's average of recent rounds less the course
    // rating (§5.2) rarely comes out whole. The 80% and its rounding apply
    // once, to the playing handicap: 80% of 21.9 = 17.52 → 18. Truncated to
    // 21 it would be 17; rounded to 22 the board would explain a number the
    // Comité never typed.
    const row = { ...PLAYERS[0]!, base_hcp: '21.9' }
    expect(mapPlayer(row).baseHcp).toBe(21.9)
    expect(mapPlayer({ ...row, base_hcp: 21.9 }).baseHcp).toBe(21.9)
    const settings = { ...DEFAULT_SETTINGS, handicap: { ...DEFAULT_SETTINGS.handicap, allowance: 0.8 } }
    const snap: Snapshot = {
      ...makeSnapshot({ settings }),
      players: [mapPlayer(row)],
      courses: [mapCourse(COURSE_ROW, TEES, HOLES)],
      rounds: [mapRound(ROUND_ROW)],
    }
    const st = computeTournament(snap, settings)
    const ana = st.core.rounds[ROUND]![ANA]!
    expect([st.core.handicaps[ANA]!.base, ana.courseHcp, ana.playingHcp]).toEqual([21.9, 21.9, 18])
    expect(ana.playingHcpWhy.steps).toEqual(['Hándicap base 21.9', '80% de 21.9 = 17.52', 'Redondeado: 18'])
  })

  it('a course keeps only its own tees, in their saved order, each with only its own holes by number; rating "71.2" → 71.2', () => {
    const c = mapCourse(COURSE_ROW, TEES, HOLES)
    expect(c.id).toBe(COURSE)
    expect(c.name).toBe('Quivira Los Cabos')
    expect(c.tees.map((t) => [t.id, t.courseId, t.name, t.color, t.rating, t.slope, t.holes.length])).toEqual([
      [BLANCAS, COURSE, 'Blancas', 'white', 71.2, 128, 18],
      [ROJAS, COURSE, 'Rojas', 'red', null, null, 18],
    ])
    expect(Object.keys(c)).toEqual(['id', 'name', 'tees'])
    const blancas = c.tees[0]!
    expect(blancas.holes.map((h) => h.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    expect(blancas.holes[0]).toEqual({ number: 1, par: 4, strokeIndex: 7, yards: 320 })
    expect(blancas.holes[4]).toEqual({ number: 5, par: 4, strokeIndex: 1, yards: 360 })
    expect(blancas.holes.map((h) => [h.par, h.strokeIndex])).toEqual(PAR_72)
    expect(c.tees[1]!.holes[17]).toEqual({ number: 18, par: 5, strokeIndex: 14, yards: null })
    // PostgREST's own form, a JSON number, maps the same.
    expect(mapCourse(COURSE_ROW, TEES.map((t) => ({ ...t, rating: t.rating == null ? null : Number(t.rating) })), HOLES)).toEqual(c)
  })

  it('rounds and groups: the date and tee time as the server prints them, only that group’s members, a back-nine start', () => {
    expect(mapRound(ROUND_ROW)).toEqual({ id: ROUND, number: 1, date: '2027-04-10', courseId: COURSE, holes: 18, status: 'live' })
    // A 9-hole round stays 9: the engine then plays half the handicap over those nine holes (MONEY-03).
    expect(mapRound({ ...ROUND_ROW, holes: 9 }).holes).toBe(9)
    expect(mapGroup(GROUP_ROW, MEMBERS)).toEqual({ id: GROUP, roundId: ROUND, number: 1, teeTime: '09:10:00', startHole: 10, playerIds: [ANA, BETO, CHUY] })
    expect(mapRoundTee({ round_id: ROUND, player_id: ANA, tee_id: ROJAS })).toEqual({ roundId: ROUND, playerId: ANA, teeId: ROJAS })
  })

  it('scores: a pick-up with no strokes or putts, a disputed hole with the values it replaced', () => {
    expect(SCORES.map(mapScore)).toEqual([
      { roundId: ROUND, playerId: ANA, hole: 1, strokes: 5, putts: 2, pickedUp: false, enteredBy: BETO, updatedAt: '2027-04-10T16:42:07.123456+00:00', disputed: false, previous: null },
      { roundId: ROUND, playerId: ANA, hole: 5, strokes: null, putts: null, pickedUp: true, enteredBy: BETO, updatedAt: '2027-04-10T16:42:07.123456+00:00', disputed: false, previous: null },
      {
        roundId: ROUND,
        playerId: BETO,
        hole: 1,
        strokes: 4,
        putts: 1,
        pickedUp: false,
        enteredBy: ANA,
        updatedAt: '2027-04-10T16:42:07.123456+00:00',
        disputed: true,
        previous: SCORES[2]!.previous,
      },
      { roundId: ROUND, playerId: CHUY, hole: 1, strokes: 6, putts: 3, pickedUp: false, enteredBy: ANA, updatedAt: '2027-04-10T16:42:07.123456+00:00', disputed: false, previous: null },
    ])
  })

  it('the Calcutta and the money: a sold lot and a pending one, a bid, a buyback, payments to and from the bank (null)', () => {
    expect(mapLot({ id: id(301), tournament_id: T, player_id: BETO, lot_number: 2, status: 'sold', price: 1750, owner_id: ANA, sold_at: '2027-04-08T03:12:45.5+00:00' })).toEqual({
      id: id(301),
      playerId: BETO,
      lotNumber: 2,
      status: 'sold',
      price: 1750,
      ownerId: ANA,
      soldAt: '2027-04-08T03:12:45.5+00:00',
    })
    expect(mapLot({ id: id(302), tournament_id: T, player_id: CHUY, lot_number: 3, status: 'pending', price: null, owner_id: null, sold_at: null })).toEqual({
      id: id(302),
      playerId: CHUY,
      lotNumber: 3,
      status: 'pending',
      price: null,
      ownerId: null,
      soldAt: null,
    })
    expect(mapBid({ id: id(311), lot_id: id(301), bidder_id: ANA, amount: 1750, created_at: '2027-04-08T03:12:30.01+00:00' })).toEqual({
      id: id(311),
      lotId: id(301),
      bidderId: ANA,
      amount: 1750,
      createdAt: '2027-04-08T03:12:30.01+00:00',
    })
    expect(mapBuyback({ lot_id: id(301), pct: 25, amount: 438, paid: true })).toEqual({ lotId: id(301), pct: 25, amount: 438, paid: true })
    expect(mapPayment({ id: id(321), tournament_id: T, from_player_id: CHUY, to_player_id: null, amount: 2500, kind: 'entry', paid: true, note: null, created_at: CREATED })).toEqual({
      id: id(321),
      fromPlayerId: CHUY,
      toPlayerId: null,
      amount: 2500,
      kind: 'entry',
      paid: true,
      note: null,
    })
    expect(mapPayment({ id: id(322), tournament_id: T, from_player_id: null, to_player_id: ANA, amount: 6600, kind: 'payout', paid: false, note: 'Efectivo el domingo', created_at: CREATED })).toEqual({
      id: id(322),
      fromPlayerId: null,
      toPlayerId: ANA,
      amount: 6600,
      kind: 'payout',
      paid: false,
      note: 'Efectivo el domingo',
    })
  })

  it('pairs, teams, the snake’s answers, signatures, overrides and the game tables', () => {
    expect(mapPair({ id: id(401), tournament_id: T, name: null, player1_id: ANA, player2_id: CHUY, kind: 'AD', picked_by_honoree: true, drawn_at: '2027-04-08T04:01:00+00:00' })).toEqual({
      id: id(401),
      name: null,
      player1Id: ANA,
      player2Id: CHUY,
      kind: 'AD',
      pickedByHonoree: true,
      drawnAt: '2027-04-08T04:01:00+00:00',
    })
    const teamMembers = [
      { team_id: id(411), player_id: BETO, tournament_id: T },
      { team_id: id(412), player_id: ANA, tournament_id: T },
      { team_id: id(411), player_id: CHUY, tournament_id: T },
    ]
    expect(mapTeam({ id: id(411), tournament_id: T, name: 'Los Compadres', number: 1, drawn_at: null }, teamMembers)).toEqual({
      id: id(411),
      name: 'Los Compadres',
      number: 1,
      playerIds: [BETO, CHUY],
      drawnAt: null,
    })
    expect(mapSnakeTiebreak({ round_id: ROUND, group_id: GROUP, hole: 7, last_holed_player_id: CHUY, decided_by: ANA, created_at: CREATED })).toEqual({
      roundId: ROUND,
      groupId: GROUP,
      hole: 7,
      lastHoledPlayerId: CHUY,
    })
    expect(mapCardSignature({ round_id: ROUND, pair_id: id(401), signed_by: BETO, signed_at: '2027-04-10T21:30:00+00:00' })).toEqual({
      roundId: ROUND,
      pairId: id(401),
      signedBy: BETO,
      signedAt: '2027-04-10T21:30:00+00:00',
    })
    expect(mapHandicapOverride({ round_id: ROUND, player_id: CHUY, playing_hcp: 13, reason: 'Jugó tees rojas el día 1', by: ANA, at: CREATED })).toEqual({
      roundId: ROUND,
      playerId: CHUY,
      playingHcp: 13,
      reason: 'Jugó tees rojas el día 1',
      by: ANA,
      at: CREATED,
    })
    expect(mapGameEntry({ tournament_id: T, game_id: 'low', player_id: BETO, created_at: CREATED })).toEqual({ gameId: 'low', playerId: BETO })
    // The Comité's decision for the whole field has no group.
    expect(mapHoleAward({ round_id: ROUND, group_id: null, hole: 16, game_id: 'cerca', player_id: ANA, decided_by: ANA, created_at: CREATED })).toEqual({
      roundId: ROUND,
      groupId: null,
      hole: 16,
      gameId: 'cerca',
      playerId: ANA,
    })
    // numeric with no scale, as text and as PostgREST sends it.
    expect(mapGameResult({ tournament_id: T, game_id: 'tacos', player_id: CHUY, share: '0.5', created_at: CREATED })).toEqual({ gameId: 'tacos', playerId: CHUY, share: 0.5 })
    expect(mapGameResult({ tournament_id: T, game_id: 'tacos', player_id: CHUY, share: 0.5, created_at: CREATED })).toEqual({ gameId: 'tacos', playerId: CHUY, share: 0.5 })
  })

  it('a row from before a column existed gets that column’s default', () => {
    const without = (r: Row, ...columns: string[]): Row => Object.fromEntries(Object.entries(r).filter(([k]) => !columns.includes(k)))
    expect(mapTournament(without(TOURNAMENT, 'counts_for_stats', 'quick', 'crew_id'))).toMatchObject({ countsForStats: true, quick: false, crewId: null })
    expect(mapScore(without(SCORES[0]!, 'disputed', 'previous'))).toMatchObject({ disputed: false, previous: null })
    expect(mapGroup(without(GROUP_ROW, 'start_hole'), MEMBERS).startHole).toBe(1)
    expect(mapRound(without(ROUND_ROW, 'holes')).holes).toBe(18)
    expect(mapPlayer(without(PLAYERS[0]!, 'handicap_source', 'sort_order'))).toMatchObject({ handicapSource: 'manual', sortOrder: 0 })
  })

  it('the engine reads what the mappers give: "14.0" plays off 14, an index of "8.1" and the estimate play off 8 on the 71.2 / 128 tee, a pick-up is a hole played for 0', () => {
    const snap: Snapshot = {
      ...makeSnapshot(),
      tournament: mapTournament(TOURNAMENT),
      players: PLAYERS.map(mapPlayer),
      courses: [mapCourse(COURSE_ROW, TEES, HOLES)],
      rounds: [mapRound(ROUND_ROW)],
      groups: [mapGroup(GROUP_ROW, MEMBERS)],
      scores: SCORES.map(mapScore),
    }
    const st = computeTournament(snap, parseSettings(snap.tournament.settings))
    const round = st.core.rounds[ROUND]!
    // Ana: the manual 14 as is. Beto: round(8.1 × 128 / 113 + (71.2 − 72)) = round(8.38) = 8.
    // Chuy: 0.45 × 3 + 0.40 × 10 + 0.15 × 18 = 8.05 → 8.1, the same 8. Full allowance (100%).
    expect([ANA, BETO, CHUY].map((p) => [st.core.handicaps[p]!.base, round[p]!.courseHcp, round[p]!.playingHcp])).toEqual([
      [14, 14, 14],
      [8.1, 8, 8],
      [8.1, 8, 8],
    ])
    const ana = round[ANA]!
    // Hole 1 (par 4, SI 7): one stroke, 5 → net 4 → 2 points. Hole 5 (SI 1): picked up → 0, but played.
    expect(ana.holes[0]).toMatchObject({ hole: 1, strokesReceived: 1, gross: 5, points: 2, pickedUp: false, played: true })
    expect(ana.holes[4]).toMatchObject({ hole: 5, strokesReceived: 1, points: 0, pickedUp: true, played: true })
    expect([ana.thru, ana.points]).toEqual([2, 2])
    // Beto: 4 with a stroke → 3 points. Chuy: 6 with a stroke → 1.
    expect([round[BETO]!.holes[0]!.points, round[CHUY]!.holes[0]!.points]).toEqual([3, 1])
    expect(st.flags.discrepancies).toEqual([{ roundId: ROUND, playerId: BETO, hole: 1 }])
  })
})

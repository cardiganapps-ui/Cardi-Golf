/**
 * Data-layer test helpers (QA-07), never imported by the app.
 *
 * `snapshotToRows` writes a snapshot out as the rows the server holds for it:
 * one list per table the snapshot reads, snake_case, every column the table
 * has (the mappers must ignore the ones the engine doesn't read), jsonb as
 * JSON. Numeric columns go out as text, the way Postgres prints them
 * (`base_hcp: "14.0"`). That is not what PostgREST sends: it sends JSON
 * numbers (`14.0`, which arrives as 14). Text is the stricter input, since a
 * mapper that forgot to convert passes a number through unharmed but not a
 * string; mappers.test.ts maps both forms. It is written by hand from
 * supabase/migrations, not derived from mappers.ts, so the two can't share a
 * mistake.
 *
 * `asStored` is the snapshot the app must get back from those rows: column
 * defaults filled in, and every list in the order the server answers (by
 * primary key, as `SNAPSHOT_KEYS` asks) followed by the store's own sorts.
 * The database keeps no other order, so neither can the snapshot.
 */
import type { Snapshot } from '../../engine/types'
import type { Row } from '../mappers'
import type { SnapshotTable } from '../snapshotTables'

/** How the fake server and `asStored` order key values: numbers by value, text by code unit. */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** A stable sort by a list of keys, like `order by k1, k2, …`. */
function by<T>(list: readonly T[], keys: (x: T) => unknown[]): T[] {
  return [...list].sort((a, b) => {
    const ka = keys(a)
    const kb = keys(b)
    for (let i = 0; i < ka.length; i++) {
      const c = compareValues(ka[i], kb[i])
      if (c) return c
    }
    return 0
  })
}

const CREATED = '2027-04-01T18:00:00+00:00'
/** numeric(4, 1) as Postgres prints it, 14 → "14.0" (PostgREST would send 14; see above). */
const dec1 = (n: number | null) => (n == null ? null : n.toFixed(1))
/** Scores have uuid keys; these sort in the snapshot's own order. */
export const scoreRowId = (i: number) => `score-${String(i).padStart(6, '0')}`

export function snapshotToRows(s: Snapshot): Record<SnapshotTable, Row[]> {
  const t = s.tournament
  const tid = t.id
  const rows: Record<SnapshotTable, Row[]> = {
    tournaments: [
      {
        id: tid,
        slug: t.slug,
        name: t.name,
        tagline: t.tagline,
        logo_url: t.logoUrl,
        accent_color: t.accentColor,
        join_code: t.joinCode,
        status: t.status,
        current_round_id: t.currentRoundId,
        settings: t.settings,
        banker_player_id: t.bankerPlayerId,
        timezone: t.timezone,
        currency: t.currency,
        created_by: null,
        created_at: CREATED,
        counts_for_stats: t.countsForStats ?? true,
        quick: t.quick ?? false,
        crew_id: t.crewId ?? null,
        is_protected: false,
      },
    ],
    players: s.players.map((p) => ({
      id: p.id,
      tournament_id: tid,
      full_name: p.fullName,
      display_name: p.displayName,
      tier: p.tier,
      base_hcp: dec1(p.baseHcp),
      handicap_source: p.handicapSource,
      handicap_index: dec1(p.handicapIndex),
      estimate_inputs: p.estimateInputs,
      default_tee_id: p.defaultTeeId,
      is_honoree: p.isHonoree,
      is_admin: p.isAdmin,
      avatar_url: p.avatarUrl,
      form_guide: p.formGuide,
      sort_order: p.sortOrder,
      created_at: CREATED,
      profile_id: null,
      profile_status: null,
    })),
    courses: s.courses.map((c) => ({
      id: c.id,
      name: c.name,
      location: null,
      source: 'manual',
      external_id: null,
      imported_at: null,
      created_by: null,
      created_at: CREATED,
      attribution: null,
      website: null,
      latitude: null,
      longitude: null,
    })),
    tees: s.courses.flatMap((c) =>
      c.tees.map((tee, i) => ({
        id: tee.id,
        course_id: c.id,
        name: tee.name,
        color: tee.color,
        rating: dec1(tee.rating),
        slope: tee.slope,
        par_total: tee.holes.reduce((sum, h) => sum + h.par, 0),
        gender: null,
        sort_order: i,
      })),
    ),
    holes: s.courses.flatMap((c) => c.tees.flatMap((tee) => tee.holes.map((h) => ({ tee_id: tee.id, number: h.number, par: h.par, stroke_index: h.strokeIndex, yards: h.yards })))),
    rounds: s.rounds.map((r) => ({ id: r.id, tournament_id: tid, number: r.number, date: r.date, course_id: r.courseId, holes: r.holes, status: r.status })),
    groups: s.groups.map((g) => ({ id: g.id, round_id: g.roundId, number: g.number, tee_time: g.teeTime, start_hole: g.startHole })),
    group_members: s.groups.flatMap((g) => g.playerIds.map((player_id) => ({ group_id: g.id, player_id }))),
    round_tees: s.roundTees.map((x) => ({ round_id: x.roundId, player_id: x.playerId, tee_id: x.teeId })),
    pairs: s.pairs.map((p) => ({
      id: p.id,
      tournament_id: tid,
      name: p.name,
      player1_id: p.player1Id,
      player2_id: p.player2Id,
      kind: p.kind,
      picked_by_honoree: p.pickedByHonoree,
      drawn_at: p.drawnAt,
    })),
    teams: s.teams.map((x) => ({ id: x.id, tournament_id: tid, name: x.name, number: x.number, drawn_at: x.drawnAt })),
    team_members: s.teams.flatMap((x) => x.playerIds.map((player_id) => ({ team_id: x.id, player_id, tournament_id: tid }))),
    scores: s.scores.map((x, i) => ({
      id: scoreRowId(i),
      round_id: x.roundId,
      player_id: x.playerId,
      hole: x.hole,
      strokes: x.strokes,
      putts: x.putts,
      picked_up: x.pickedUp,
      entered_by: x.enteredBy,
      client_ts: x.updatedAt,
      updated_at: x.updatedAt,
      disputed: x.disputed ?? false,
      previous: x.previous ?? null,
      reason: null,
    })),
    snake_tiebreaks: s.snakeTiebreaks.map((x) => ({ round_id: x.roundId, group_id: x.groupId, hole: x.hole, last_holed_player_id: x.lastHoledPlayerId, decided_by: null, created_at: CREATED })),
    card_signatures: s.cardSignatures.map((x) => ({ round_id: x.roundId, pair_id: x.pairId, signed_by: x.signedBy, signed_at: x.signedAt })),
    handicap_overrides: s.handicapOverrides.map((x) => ({ round_id: x.roundId, player_id: x.playerId, playing_hcp: x.playingHcp, reason: x.reason, by: x.by, at: x.at })),
    calcutta_lots: s.calcuttaLots.map((l) => ({
      id: l.id,
      tournament_id: tid,
      player_id: l.playerId,
      lot_number: l.lotNumber,
      status: l.status,
      price: l.price,
      owner_id: l.ownerId,
      sold_at: l.soldAt,
    })),
    calcutta_bids: s.calcuttaBids.map((b) => ({ id: b.id, lot_id: b.lotId, bidder_id: b.bidderId, amount: b.amount, created_at: b.createdAt })),
    calcutta_buybacks: s.calcuttaBuybacks.map((b) => ({ lot_id: b.lotId, pct: b.pct, amount: b.amount, paid: b.paid })),
    payments: s.payments.map((p) => ({
      id: p.id,
      tournament_id: tid,
      from_player_id: p.fromPlayerId,
      to_player_id: p.toPlayerId,
      amount: p.amount,
      kind: p.kind,
      paid: p.paid,
      note: p.note,
      created_at: CREATED,
    })),
    game_entries: s.gameEntries.map((x) => ({ tournament_id: tid, game_id: x.gameId, player_id: x.playerId, created_at: CREATED })),
    hole_awards: s.holeAwards.map((x) => ({ round_id: x.roundId, group_id: x.groupId, hole: x.hole, game_id: x.gameId, player_id: x.playerId, decided_by: null, created_at: CREATED })),
    // numeric with no scale as Postgres prints it, 1 → "1" and 0.5 → "0.5" (PostgREST would send 1 and 0.5).
    game_results: s.gameResults.map((x) => ({ tournament_id: tid, game_id: x.gameId, player_id: x.playerId, share: String(x.share), created_at: CREATED })),
  }
  // Through JSON, as the wire carries it (with the numeric columns as text, above).
  return JSON.parse(JSON.stringify(rows)) as Record<SnapshotTable, Row[]>
}

export function asStored(s: Snapshot): Snapshot {
  const read = new Set(s.rounds.map((r) => r.courseId).filter(Boolean))
  return {
    tournament: { ...s.tournament, countsForStats: s.tournament.countsForStats ?? true, quick: s.tournament.quick ?? false, crewId: s.tournament.crewId ?? null },
    players: by(by(s.players, (p) => [p.id]), (p) => [p.sortOrder]),
    // Only the courses its rounds are played on; tees in their saved order, holes by number.
    courses: by(
      s.courses.filter((c) => read.has(c.id)),
      (c) => [c.id],
    ).map((c) => ({ ...c, tees: c.tees.map((tee) => ({ ...tee, holes: by(tee.holes, (h) => [h.number]) })) })),
    rounds: by(by(s.rounds, (r) => [r.id]), (r) => [r.number]),
    groups: by(by(s.groups, (g) => [g.id]), (g) => [g.number]).map((g) => ({ ...g, playerIds: by(g.playerIds, (id) => [id]) })),
    roundTees: by(s.roundTees, (x) => [x.roundId, x.playerId]),
    pairs: by(s.pairs, (p) => [p.id]),
    teams: by(by(s.teams, (x) => [x.id]), (x) => [x.number]).map((x) => ({ ...x, playerIds: by(x.playerIds, (id) => [id]) })),
    // `scoreRowId` keeps the snapshot's order and is the id a fetch brings; `disputed` and `previous` have column defaults.
    scores: s.scores.map((x, i) => ({ ...x, id: scoreRowId(i), disputed: x.disputed ?? false, previous: x.previous ?? null })),
    snakeTiebreaks: by(s.snakeTiebreaks, (x) => [x.roundId, x.groupId, x.hole]),
    cardSignatures: by(s.cardSignatures, (x) => [x.roundId, x.pairId]),
    handicapOverrides: by(s.handicapOverrides, (x) => [x.roundId, x.playerId]),
    calcuttaLots: by(s.calcuttaLots, (x) => [x.id]),
    calcuttaBids: by(s.calcuttaBids, (x) => [x.id]),
    calcuttaBuybacks: by(s.calcuttaBuybacks, (x) => [x.lotId]),
    payments: by(s.payments, (x) => [x.id]),
    gameEntries: by(s.gameEntries, (x) => [x.gameId, x.playerId]),
    holeAwards: by(s.holeAwards, (x) => [x.roundId, x.gameId, x.hole, x.playerId]),
    gameResults: by(s.gameResults, (x) => [x.gameId, x.playerId]),
  }
}

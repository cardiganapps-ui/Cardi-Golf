/**
 * A link to watch a tournament without a PIN (STRAT-05, migration 0053):
 * `/v/<token>`. The Comité makes it in Comité › Torneo › Estado; whoever has
 * it sees the boards with no account and no session, and nothing there writes.
 *
 * `spectator_board` is the one request the page makes, polled while it is on
 * screen. It answers only what the boards need: short names, scores, groups
 * and games, and money only when the link shows it («Con dinero»). The phone
 * applies the same rules again to whatever it shows (`forSpectators`), so the
 * design fixtures (`/v/_/<fixture>`) render exactly what the server would send.
 */
import type { Snapshot } from '../engine/types'
import { z } from 'zod'
import { anonRpc } from './anonRpc'
import type { Row } from './mappers'
import { SPECTATOR_PREFIX, snapshotFromRows, type SnapshotRows } from './tournamentStore'
import { SETTINGS_SPEC, type SettingsSpec } from '../engine/settings/spec'
import { normalizeLegacySettings } from '../engine/settings/schema'
import { isUnknownGame, newerSettingsKeys, withoutUnknownGames } from '../engine/settings/read'
import { parseAnswer, rpc } from './rpc'

/** The link as the Comité sees it (0053 `spectator_link`). */
export interface SpectatorLink {
  /** 24 URL-safe characters: the link is `/v/<token>`. */
  token: string
  /** «Con dinero»: the link also shows what each person wins, pays and owes, and the Calcutta. */
  money: boolean
  createdAt: string
  /** When «Cambiar enlace» last gave it a new token. */
  rotatedAt: string | null
}

/** A link as the server answers it, or null for anything else (no link, an answer this build can't read). */
function asLink(v: unknown): SpectatorLink | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const x = v as Record<string, unknown>
  if (typeof x.token !== 'string' || !TOKEN_SHAPE.test(x.token)) return null
  return { token: x.token, money: x.money === true, createdAt: String(x.createdAt ?? ''), rotatedAt: typeof x.rotatedAt === 'string' ? x.rotatedAt : null }
}

/** The tournament's link, for its Comité; null when there is none. */
export async function spectatorLink(tournamentId: string): Promise<SpectatorLink | null> {
  return asLink(await rpc('spectator_link', { p_tournament_id: tournamentId }))
}

/**
 * «Crear enlace para ver», the money choice, and «Cambiar enlace» (`newToken`:
 * the old link stops working at once). The Comité only. `seen` is the link as
 * the card showed it when the choice was made (null: none): the server refuses
 * the save, writing nothing, when the link is not that one any more (another
 * Comité phone made it, changed it or switched it off meanwhile), so a stale
 * card never shows the money on a link already shared without asking first.
 */
export async function saveSpectatorLink(tournamentId: string, money: boolean, seen: SpectatorLink | null, newToken = false): Promise<SpectatorLink | null> {
  return asLink(
    await rpc('save_spectator_link', { p_tournament_id: tournamentId, p_money: money, p_seen: seen ? { token: seen.token, money: seen.money } : null, p_new_token: newToken }),
  )
}

/** «Apagar»: nobody opens the boards with it any more. The Comité only. */
export async function deleteSpectatorLink(tournamentId: string): Promise<void> {
  await rpc('delete_spectator_link', { p_tournament_id: tournamentId })
}

/** Where a link opens, on this host (never a hard-coded one, CLAUDE.md §3). */
export const spectatorPath = (token: string) => `/v/${token}`
export const spectatorUrl = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}${spectatorPath(token)}`

/** The shape of a token: anything else is no link, and is never sent. */
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{24}$/

/** What the page polls: the boards, or the version it already holds when nothing changed. */
export type BoardAnswer = { same: true; version: string } | { same: false; version: string; money: boolean; snapshot: Snapshot }

/** The store's id for one link's boards: a short hash of the token (a key, not a secret: the token is in the address). */
export function spectatorStoreId(token: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 16777619)
  return `${SPECTATOR_PREFIX}${(h >>> 0).toString(36)}`
}

/**
 * The boards for a link (0053 `spectator_board`), or null when the link does
 * not work: a wrong token, one the Comité changed or switched off. `seen` is
 * the version this page holds; when nothing changed the server answers that.
 */
export async function spectatorBoard(token: string, seen: string | null): Promise<BoardAnswer | null> {
  if (!TOKEN_SHAPE.test(token)) return null
  // As anon with no session, whatever this browser keeps: the page is nobody's (`anonRpc`).
  const raw = await anonRpc('spectator_board', { p_token: token, p_seen: seen })
  if (!raw || typeof raw !== 'object') return null
  const answer = parseAnswer('spectator_board', BoardSchema, raw)
  if (answer.same === true) return { same: true, version: String(answer.version) }
  return { same: false, version: String(answer.version ?? ''), money: answer.money === true, snapshot: snapshotFromBoard(answer, spectatorStoreId(token)) }
}

/** The tables the answer carries, by name: the snapshot's own. */
const TABLES = [
  'players', 'courses', 'tees', 'holes', 'rounds', 'groups', 'group_members', 'round_tees', 'pairs', 'teams', 'team_members', 'scores',
  'snake_tiebreaks', 'card_signatures', 'handicap_overrides', 'game_entries', 'hole_awards', 'game_results',
  'calcutta_lots', 'calcutta_bids', 'calcutta_buybacks', 'payments', 'money_adjustments',
] as const

const boardRow = z.record(z.string(), z.unknown())
/**
 * The answer as the page reads it (ARCH-03): the tournament an object and
 * each table a list of rows, so a malformed answer is an error the page shows
 * over the boards it has, never a row the mappers can't read. A table the
 * answer leaves out reads as empty, as before.
 */
const BoardSchema = z.looseObject({
  same: z.unknown().optional(),
  version: z.unknown().optional(),
  money: z.unknown().optional(),
  tournament: boardRow.nullish(),
  ...Object.fromEntries(TABLES.map((table) => [table, z.array(boardRow).nullish()])),
})

/** spectator_board's answer as the snapshot the engine reads, under the id the store keeps it by. */
export function snapshotFromBoard(answer: Row, id: string): Snapshot {
  const rows: SnapshotRows = { tournament: { ...(answer.tournament ?? {}), id, slug: '', join_code: '' } }
  for (const table of TABLES) if (Array.isArray(answer[table])) rows[table] = answer[table] as Row[]
  return forSpectators(snapshotFromRows(rows), answer.money === true, id)
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * What of the settings a link carries: every key the settings schema knows
 * (`engine/settings/spec.ts`; a test holds it to `TournamentSettingsSchema`
 * and to 0053's `spectator_settings_spec`).
 */
export type { SettingsSpec }
export const SPECTATOR_SETTINGS_SPEC = SETTINGS_SPEC

const plain = (v: unknown) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

/**
 * `v` as `spec` allows it, the same as 0053's `spectator_pick`: an object keeps
 * only the keys the spec names, a list each element, a value of another kind
 * is null and an object of a kind the spec doesn't know is {}. What the schema
 * reads parses exactly as before (it drops unknown keys itself, and a value of
 * the wrong kind fails it either way); nothing else comes through.
 */
export function pickBySpec(v: unknown, spec: SettingsSpec): unknown {
  if (v === undefined) return undefined
  if (spec === 's') return plain(v) ? v : null
  if ('o' in spec) {
    if (!isObject(v)) return null
    const out: Record<string, unknown> = {}
    for (const [k, s] of Object.entries(spec.o)) if (Object.hasOwn(v, k)) out[k] = pickBySpec(v[k], s)
    return out
  }
  if ('a' in spec) return Array.isArray(v) ? v.map((e) => pickBySpec(e, spec.a) ?? null) : null
  if ('d' in spec) {
    if (!isObject(v)) return null
    const tag = v[spec.d]
    return typeof tag === 'string' && Object.hasOwn(spec.by, tag) ? pickBySpec(v, spec.by[tag]!) : {}
  }
  const opt = spec.u.find((o) => (o === 's' ? plain(v) : 'a' in o ? Array.isArray(v) : isObject(v)))
  return opt ? pickBySpec(v, opt) : null
}

/** A side game paid from a side pot: whoever is in it paid its buy-in. */
const sidePot = (g: unknown) => isObject(g) && isObject(g.money) && g.money.source === 'side'

/** The side pots' ids: «Sin dinero» leaves them out, with who is in them, their claims and results. */
function sidePotIds(raw: unknown): Set<string> {
  const games = isObject(raw) && Array.isArray(raw.games) ? raw.games : []
  return new Set(games.filter(sidePot).map((g) => (g as { id?: unknown }).id).filter((id): id is string => typeof id === 'string'))
}

/** A side game as a link shows it: a custom bet without its description (the Comité's free text), and without money just for fun. */
function spectatorGame(g: unknown, money: boolean): unknown {
  if (!isObject(g)) return g
  const out: Record<string, unknown> = money ? { ...g } : { ...g, money: { source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100] } }
  if (g.type === 'custom' && isObject(g.options)) out.options = { ...g.options, description: '' }
  return out
}

/** A side game this build doesn't know, as a link carries it: its name and whether it moves money (none without money), nothing else. */
function unknownGamePlaceholder(g: unknown, money: boolean): Record<string, unknown> {
  const o = isObject(g) ? g : {}
  const source = isObject(o.money) && typeof o.money.source === 'string' ? o.money.source : null
  return {
    id: o.id,
    type: o.type,
    label: o.label,
    enabled: o.enabled,
    ...(money ? (source ? { money: { source } } : {}) : { money: { source: 'none' } }),
  }
}

/**
 * The settings as a link shows them, the same as 0053's `spectator_settings`:
 * older keys first read as today's (`normalizeLegacySettings`, as the members'
 * parse reads them), then only the keys the schema knows (`SPECTATOR_SETTINGS_SPEC`), never a custom
 * bet's description, the Comité's free text; and without money every peso at
 * zero, the Calcutta off, each side game for fun and a side pot left out
 * altogether. The boards computed from them carry no money, and they still parse.
 */
export function spectatorSettings(input: unknown, money: boolean): unknown {
  // A newer build's settings (ARCH-04): picked to this build's keys, the page would compute without what it doesn't know.
  // Nothing of them, so the page says to update; a side game it doesn't know goes on by its name, for the page to set aside.
  if (newerSettingsKeys(input).length) return null
  const unknown = (isObject(input) && Array.isArray(input.games) ? input.games : []).filter(isUnknownGame)
  const placeholders = unknown.filter((g) => money || !sidePot(g)).map((g) => unknownGamePlaceholder(g, money))
  const raw = pickBySpec(normalizeLegacySettings(withoutUnknownGames(input)), SPECTATOR_SETTINGS_SPEC)
  if (!isObject(raw)) return raw
  const known = Array.isArray(raw.games) ? raw.games : []
  if (money) return Array.isArray(raw.games) || placeholders.length ? { ...raw, games: [...known.map((g) => spectatorGame(g, true)), ...placeholders] } : raw
  const modules = isObject(raw.modules) ? raw.modules : null
  return {
    ...raw,
    entryFee: 0,
    houseCut: 0,
    prizes: { stableford: [], stablefordMode: 'amount', pairs: [], bestRoundPerDay: 0, snakePerSurvivor: 0, fewestPutts: 0 },
    auction: { openingBid: 1, increment: 1, maxPlayersPerOwner: 1, selfOwnedCountsTowardMax: true, guestsCanBid: false, buybackMaxPct: 0, payout: [{ slot: 'place', place: 1, share: 1 }] },
    games: [...known.filter((g) => !sidePot(g)).map((g) => spectatorGame(g, false)), ...placeholders],
    ...(modules && isObject(modules.auction) ? { modules: { ...modules, auction: { ...modules.auction, enabled: false } } } : {}),
  }
}

/**
 * What a link to watch shows of a tournament, as 0053's `spectator_board`
 * answers it, from any snapshot (the server's answer again, or a design
 * fixture): short names only (no full name, photo, form guide, Comité flag or
 * handicap note), nobody's account or entry, none of the free text the Comité
 * types beyond names, and without money no payment, decision, Calcutta lot,
 * bid or buyback, no banker, no side pot or who is in one, and settings with
 * no peso in them.
 */
export function forSpectators(s: Snapshot, money: boolean, id: string): Snapshot {
  const t = s.tournament
  const hidden = money ? new Set<string>() : sidePotIds(t.settings)
  return {
    ...s,
    tournament: {
      id,
      slug: '',
      joinCode: '',
      name: t.name,
      tagline: t.tagline,
      logoUrl: t.logoUrl,
      accentColor: t.accentColor,
      status: t.status,
      currentRoundId: t.currentRoundId,
      bankerPlayerId: money ? t.bankerPlayerId : null,
      settings: spectatorSettings(t.settings, money),
    },
    players: s.players.map((p) => ({ ...p, fullName: p.displayName, avatarUrl: null, formGuide: null, isAdmin: false, handicapNote: null })),
    scores: s.scores.map((x) => ({ roundId: x.roundId, playerId: x.playerId, hole: x.hole, strokes: x.strokes, putts: x.putts, pickedUp: x.pickedUp, enteredBy: null, updatedAt: x.updatedAt })),
    snakeTiebreaks: s.snakeTiebreaks.map((x) => ({ roundId: x.roundId, groupId: x.groupId, hole: x.hole, lastHoledPlayerId: x.lastHoledPlayerId })),
    handicapOverrides: s.handicapOverrides.map((x) => ({ ...x, reason: '', by: null })),
    gameEntries: s.gameEntries.filter((x) => !hidden.has(x.gameId)),
    holeAwards: s.holeAwards.filter((x) => !hidden.has(x.gameId)),
    gameResults: s.gameResults.filter((x) => !hidden.has(x.gameId)),
    calcuttaLots: money ? s.calcuttaLots : [],
    calcuttaBids: money ? s.calcuttaBids : [],
    calcuttaBuybacks: money ? s.calcuttaBuybacks : [],
    payments: money ? s.payments.map((x) => ({ ...x, note: null })) : [],
    moneyAdjustments: money ? (s.moneyAdjustments ?? []).map((x) => ({ ...x, reason: '', createdBy: null, voidReason: null })) : [],
  }
}

/** How often the page asks: as the boards move. */
export const POLL = {
  /** Calcutta night: the room watches each bid. */
  auction: 5_000,
  /** A day in play. */
  live: 20_000,
  /** Nothing in play (before the trip, between days, after the last), or nothing moved for `idleAfter`. */
  quiet: 120_000,
  idleAfter: 15 * 60_000,
  /** Errors wait longer each time, up to this. */
  maxBackoff: 5 * 60_000,
}

/**
 * The wait before the next ask: by what the boards show (the auction, a live
 * day, nothing), slower once nothing has moved for a while, and longer after
 * each failure in a row, so a TV left on all night never hammers the server.
 */
export function nextPoll(s: { status: string | null; anyRoundLive: boolean; quietMs: number; failures: number }): number {
  const base = s.status === 'auction' ? POLL.auction : s.anyRoundLive ? POLL.live : POLL.quiet
  const idle = s.quietMs >= POLL.idleAfter ? Math.max(base, POLL.quiet) : base
  return s.failures > 0 ? Math.min(POLL.maxBackoff, idle * 2 ** s.failures) : idle
}

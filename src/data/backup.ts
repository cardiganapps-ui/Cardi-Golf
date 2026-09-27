/**
 * Backup export and restore (§13 Data): every row of one tournament as JSON,
 * and a restore that puts a backup of the SAME tournament back (ids are
 * preserved, so a backup restores exactly). Courses are shared and are not
 * touched. Player PINs live in a separate table and are never exported.
 */
import { supabase } from '../lib/supabase'

type Row = Record<string, unknown>

export interface Backup {
  version: 1
  exportedAt: string
  tournamentId: string
  slug: string
  tables: Record<string, Row[]>
}

/** Tables keyed by how they hang off the tournament. */
const BY_TOURNAMENT = ['players', 'rounds', 'pairs', 'calcutta_lots', 'payments'] as const
const BY_ROUND = ['groups', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides'] as const
const BY_LOT = ['calcutta_bids', 'calcutta_buybacks'] as const

async function rows(table: string, col: string, ids: string[]): Promise<Row[]> {
  if (!ids.length) return []
  const { data, error } = await supabase().from(table).select('*').in(col, ids)
  if (error) throw error
  return (data ?? []) as Row[]
}

export async function exportBackup(tournamentId: string): Promise<Backup> {
  const sb = supabase()
  const { data: tournament, error } = await sb.from('tournaments').select('*').eq('id', tournamentId).single()
  if (error) throw error
  const tables: Record<string, Row[]> = { tournaments: [tournament as Row] }
  for (const t of BY_TOURNAMENT) tables[t] = await rows(t, 'tournament_id', [tournamentId])
  const roundIds = tables.rounds!.map((r) => r.id as string)
  for (const t of BY_ROUND) tables[t] = await rows(t, 'round_id', roundIds)
  const groupIds = tables.groups!.map((g) => g.id as string)
  tables.group_members = await rows('group_members', 'group_id', groupIds)
  const lotIds = tables.calcutta_lots!.map((l) => l.id as string)
  for (const t of BY_LOT) tables[t] = await rows(t, 'lot_id', lotIds)
  // Courses used (read-only reference, so a restore elsewhere can rebuild them by hand).
  const courseIds = [...new Set(tables.rounds!.map((r) => r.course_id).filter(Boolean))] as string[]
  tables.courses = await rows('courses', 'id', courseIds)
  tables.tees = await rows('tees', 'course_id', courseIds)
  tables.holes = await rows('holes', 'tee_id', tables.tees.map((t) => t.id as string))
  return { version: 1, exportedAt: new Date().toISOString(), tournamentId, slug: (tournament as Row).slug as string, tables }
}

/** Columns of `tournaments` a restore may overwrite. */
const TOURNAMENT_COLS = ['name', 'tagline', 'logo_url', 'accent_color', 'status', 'current_round_id', 'settings', 'banker_player_id', 'timezone', 'currency']

export async function restoreBackup(tournamentId: string, backup: Backup): Promise<void> {
  if (backup.version !== 1 || backup.tournamentId !== tournamentId) throw new Error('wrong-tournament')
  const sb = supabase()
  const T = backup.tables
  const ok = (r: { error: { message: string } | null }, ctx: string) => {
    if (r.error) throw new Error(`${ctx}: ${r.error.message}`)
  }
  const del = async (table: string, col: string, ids: string[]) => {
    if (ids.length) ok(await sb.from(table).delete().in(col, ids), `delete ${table}`)
  }
  const ins = async (table: string, list: Row[] | undefined) => {
    if (list?.length) ok(await sb.from(table).insert(list), `insert ${table}`)
  }
  // Wipe dependents (cascades take care of most, but be explicit and ordered).
  const { data: curRounds } = await sb.from('rounds').select('id').eq('tournament_id', tournamentId)
  const roundIds = (curRounds ?? []).map((r) => r.id as string)
  const { data: curLots } = await sb.from('calcutta_lots').select('id').eq('tournament_id', tournamentId)
  const lotIds = (curLots ?? []).map((l) => l.id as string)
  await del('payments', 'tournament_id', [tournamentId])
  await del('calcutta_buybacks', 'lot_id', lotIds)
  await del('calcutta_bids', 'lot_id', lotIds)
  await del('calcutta_lots', 'tournament_id', [tournamentId])
  for (const t of ['card_signatures', 'handicap_overrides', 'snake_tiebreaks', 'scores', 'round_tees', 'groups']) await del(t, 'round_id', roundIds)
  await del('pairs', 'tournament_id', [tournamentId])
  // Players and rounds keep their ids: upsert, then drop the ones the backup does not have.
  ok(await sb.from('players').upsert(T.players ?? [], { onConflict: 'id' }), 'players')
  ok(await sb.from('rounds').upsert(T.rounds ?? [], { onConflict: 'id' }), 'rounds')
  const keepPlayers = (T.players ?? []).map((p) => p.id as string)
  const keepRounds = (T.rounds ?? []).map((r) => r.id as string)
  const { data: allPlayers } = await sb.from('players').select('id').eq('tournament_id', tournamentId)
  await del('players', 'id', (allPlayers ?? []).map((p) => p.id as string).filter((id) => !keepPlayers.includes(id)))
  await del('rounds', 'id', roundIds.filter((id) => !keepRounds.includes(id)))
  // Then everything else, in dependency order.
  await ins('groups', T.groups)
  await ins('group_members', T.group_members)
  await ins('round_tees', T.round_tees)
  await ins('pairs', T.pairs)
  await ins('scores', T.scores?.map((s) => ({ ...s, disputed: false, previous: null })))
  await ins('snake_tiebreaks', T.snake_tiebreaks)
  await ins('card_signatures', T.card_signatures)
  await ins('handicap_overrides', T.handicap_overrides)
  await ins('calcutta_lots', T.calcutta_lots)
  await ins('calcutta_bids', T.calcutta_bids)
  await ins('calcutta_buybacks', T.calcutta_buybacks)
  await ins('payments', T.payments)
  const tr = T.tournaments?.[0]
  if (tr) {
    const patch: Row = {}
    for (const c of TOURNAMENT_COLS) if (c in tr) patch[c] = tr[c]
    ok(await sb.from('tournaments').update(patch).eq('id', tournamentId), 'tournament')
  }
}

/** Minimal CSV: quotes fields that need it. */
export function toCsv(header: string[], lines: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...lines].map((l) => l.map(cell).join(',')).join('\n') + '\n'
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

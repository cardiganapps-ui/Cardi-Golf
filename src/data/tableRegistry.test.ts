/**
 * ARCH-16: the tables a tournament is made of were listed by hand in several places (the boards' paging keys,
 * the «Respaldo» export and its keys, the nightly backup, the live channel), and a table one list forgot
 * already stopped every tournament with a team draw from loading (ARCH-09). `SNAPSHOT_KEYS` is the one list
 * of the tables the boards and the export read, held to the migrations' keys by snapshotTables.test.ts; the
 * export pages by it (backup.ts), and this file holds the rest to it:
 *   - the export carries exactly the tables the boards load;
 *   - every table a migration creates that hangs off a tournament is on the boards, or named here with why not,
 *     so a new one is a decision, never one list forgotten;
 *   - the nightly backup covers every table the boards load, and the live channel names only those.
 */
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES } from '../lib/backupTables'
import { RESTORED_TABLES } from './backup'
import { APPLIED_TABLES, RELOADED_TABLES } from './realtimeApply'
import { SNAPSHOT_KEYS } from './snapshotTables'
import { migrationsSql } from './testing/migrationKeys'

/** A tournament's tables the boards don't load, each with why. */
const NOT_ON_THE_BOARDS: Record<string, string> = {
  tournament_organizers: 'who runs it: my_membership answers it, the boards never show it',
  device_sessions: "a phone's PIN claim: read by the gate, never a fact of the tournament",
  audit_log: 'the history: Comité › Historial pages it on its own (tournament_audit)',
  photos: 'unused by any screen',
  round_results: 'computed by SQL from the scores, for profiles',
  tournament_results: 'published results, for profiles',
  tournament_money: "published nets, for each player's profile",
  rivalry_rounds: 'profiles: rivalries between friends',
  platform_unlocks: 'the Admin de Polo',
  platform_audit_log: 'the Admin de Polo',
  score_mutations: "save_hole's answers to a repeated call",
  rejected_writes: "the Comité's «Pendientes de revisar», read by rejected_inbox",
  client_events: 'telemetry',
  device_status: 'telemetry',
  pin_claims: 'which phones held a PIN: player_phones',
  pin_push_subscriptions: "a PIN phone's push address",
  player_notices: 'notices sent to players',
  spectator_links: "the link to watch's token: never on a member's boards",
  player_corrections: 'what a player asked the Comité to correct: Comité › Jugadores reads it (player_corrections)',
}

/** Every table a migration creates whose rows hang off a tournament: by the tournament, a day, a group or a lot. */
function tournamentTables(): string[] {
  const sql = migrationsSql()
  const blocks = new Map<string, string>()
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) blocks.set(m[1]!, m[2]!)
  for (const m of sql.matchAll(/alter table (?:only )?public\.([a-z_]+)\s+add column (?:if not exists )?([a-z_]+)/gi)) blocks.set(m[1]!, `${blocks.get(m[1]!) ?? ''}\n${m[2]!} `)
  return [...blocks].filter(([, body]) => /(^|\s|,)(tournament_id|round_id|lot_id|group_id)\s/m.test(body)).map(([table]) => table)
}

describe('the tournament’s table registry (ARCH-16)', () => {
  const boards = new Set(Object.keys(SNAPSHOT_KEYS))

  // backupKeys.test.ts runs the export and holds what it pages to the file's tables.
  it('the «Respaldo» export carries exactly the tables the boards load: what it restores and the courses played', () => {
    expect([...RESTORED_TABLES, 'courses', 'tees', 'holes'].sort()).toEqual([...boards].sort())
  })

  it('every table that hangs off a tournament is on the boards or named with why not', () => {
    const found = tournamentTables()
    expect(found.length).toBeGreaterThan(30)
    expect(found.filter((t) => !boards.has(t) && !(t in NOT_ON_THE_BOARDS))).toEqual([])
    // And nothing named here is on the boards or gone from the migrations.
    expect(Object.keys(NOT_ON_THE_BOARDS).filter((t) => boards.has(t) || !found.includes(t))).toEqual([])
  })

  it('the nightly backup covers every table the boards load', () => {
    expect([...boards].filter((t) => !(t in BACKUP_TABLES))).toEqual([])
  })

  it('the live channel applies or reloads only tables the boards hold', () => {
    expect([...APPLIED_TABLES, ...RELOADED_TABLES].filter((t) => !boards.has(t))).toEqual([])
  })
})

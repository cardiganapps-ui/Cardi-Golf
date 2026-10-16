/**
 * Tables the nightly backup copies, each with the ORDER BY that makes paging
 * stable (its primary key). A table added in a migration must be added here;
 * the test compares this list against supabase/migrations.
 */
export const BACKUP_TABLES: Record<string, string> = {
  _migrations: 'name',
  tournaments: 'id',
  tournament_organizers: 'tournament_id,auth_user_id',
  organizers: 'auth_user_id',
  courses: 'id',
  course_documents: 'id',
  tees: 'id',
  holes: 'tee_id,number',
  players: 'id',
  pin_attempts: 'auth_user_id',
  device_sessions: 'auth_user_id',
  pin_claims: 'id',
  pairs: 'id',
  teams: 'id',
  team_members: 'team_id,player_id',
  rounds: 'id',
  round_tees: 'round_id,player_id',
  groups: 'id',
  group_members: 'group_id,player_id',
  scores: 'id',
  score_mutations: 'mutation_id',
  rejected_writes: 'id',
  snake_tiebreaks: 'round_id,group_id,hole',
  card_signatures: 'round_id,card_id',
  handicap_overrides: 'round_id,player_id',
  calcutta_lots: 'id',
  calcutta_bids: 'id',
  calcutta_buybacks: 'lot_id',
  payments: 'id',
  money_adjustments: 'id',
  game_entries: 'tournament_id,game_id,player_id',
  hole_awards: 'round_id,game_id,hole,player_id,source',
  game_results: 'tournament_id,game_id,player_id',
  photos: 'id',
  audit_log: 'id',
  profiles: 'id',
  round_results: 'round_id,player_id',
  tournament_results: 'tournament_id,player_id',
  tournament_money: 'tournament_id,player_id',
  friendships: 'a,b',
  notifications: 'id',
  rivalries: 'id',
  rivalry_rounds: 'rivalry_id,round_id',
  crews: 'id',
  crew_members: 'crew_id,profile_id',
  // Who waits to enter a crew that approves who enters (0071, TRUST-11).
  crew_requests: 'crew_id,profile_id',
  // What each player was told: kept so a restored database never tells them again.
  player_notices: 'id',
  platform_admins: 'auth_user_id',
  platform_unlocks: 'auth_user_id,tournament_id',
  platform_audit_log: 'id',
  platform_settings: 'key',
  backup_runs: 'id',
  retention_runs: 'id',
  legal_acceptances: 'id',
  // What a player asked the Comité to correct about him (0070, TRUST-16).
  player_corrections: 'id',
}

/**
 * Tables the backup leaves out on purpose, each with why. The privacy notice
 * says telemetry is gone after 30 days (devices after 90), and the nightly
 * backups are never deleted, so a backed-up copy would keep it forever. A
 * link to watch is a key to the boards: a restore must never bring back one
 * the Comité changed or switched off, and the backups (never deleted) would
 * keep every token it ever had. After a restore the Comité makes a new one.
 *
 * Secrets stay out too (TRUST-10): whoever holds a night's file must not hold
 * a way in. A PIN is four digits, so its hash falls to a guess in minutes; a
 * link token is a sign-in; a browser's push address and keys let anyone with
 * the VAPID pair notify that phone. After a restore each player has no PIN
 * until the Comité sets one (scripts/restore-r2.mjs says how many), and each
 * phone turns its notices on again (RUNBOOK.md §8b).
 */
export const NOT_BACKED_UP: Record<string, string> = {
  client_events: 'telemetry, kept 30 days (STRAT-02)',
  device_status: 'telemetry, kept 90 days (STRAT-02)',
  spectator_links: 'a key to the boards: a restore must not bring back one the Comité changed or switched off (STRAT-05)',
  player_pins: 'the PIN hashes: four digits fall to a guess offline; a restored player gets his PIN from the Comité again (TRUST-10)',
  profile_link_tokens: 'one-time sign-in tokens, good for 15 minutes (TRUST-10)',
  push_subscriptions: 'a browser\'s push address and keys: with the VAPID pair they notify that phone; it turns notices on again (TRUST-10)',
  pin_push_subscriptions: 'as push_subscriptions, for the PIN phones (TRUST-10)',
}

/**
 * Keys that never go into a night's file, at any depth: in a row, in a
 * history image (`before`, `after`) or in an operator's payload. The tables
 * that hold them are left out above; this is the second lock, for a column
 * or an image no one thought of (the history of a table that once had one).
 */
export const SECRET_KEYS: ReadonlySet<string> = new Set(['pin_hash', 'token_hash', 'token', 'p256dh', 'auth', 'endpoint', 'encrypted_password'])

/** `value` with every SECRET_KEYS key taken out, at any depth; arrays and scalars as they are. */
export function withoutSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutSecrets) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (!SECRET_KEYS.has(k)) out[k] = withoutSecrets(v)
    return out as T
  }
  return value
}

/** R2 object key for a backup taken at `at` (UTC date). */
export function backupKey(at: Date): string {
  return `backups/${at.toISOString().slice(0, 10)}.json.gz`
}

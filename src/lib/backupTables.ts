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
  player_pins: 'player_id',
  pin_attempts: 'auth_user_id',
  device_sessions: 'auth_user_id',
  pairs: 'id',
  rounds: 'id',
  round_tees: 'round_id,player_id',
  groups: 'id',
  group_members: 'group_id,player_id',
  scores: 'id',
  snake_tiebreaks: 'round_id,group_id,hole',
  card_signatures: 'round_id,pair_id',
  handicap_overrides: 'round_id,player_id',
  calcutta_lots: 'id',
  calcutta_bids: 'id',
  calcutta_buybacks: 'lot_id',
  payments: 'id',
  game_entries: 'tournament_id,game_id,player_id',
  hole_awards: 'round_id,game_id,hole,player_id',
  game_results: 'tournament_id,game_id,player_id',
  photos: 'id',
  audit_log: 'id',
  profiles: 'id',
  profile_link_tokens: 'token_hash',
  round_results: 'round_id,player_id',
  tournament_results: 'tournament_id,player_id',
  tournament_money: 'tournament_id,player_id',
  friendships: 'a,b',
  notifications: 'id',
  rivalries: 'id',
  rivalry_rounds: 'rivalry_id,round_id',
  crews: 'id',
  crew_members: 'crew_id,profile_id',
}

/** R2 object key for a backup taken at `at` (UTC date). */
export function backupKey(at: Date): string {
  return `backups/${at.toISOString().slice(0, 10)}.json.gz`
}

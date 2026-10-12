/**
 * What each table keeps about people, and where the privacy notice says so
 * (TRUST-04). Every table a migration creates is here: the ones that hold
 * personal data name the notice section that tells people about it and how
 * long it is kept; the rest say why they hold none. The test reads the
 * migrations and the notice, so a new table that holds people can't ship
 * without the notice covering it.
 */

/** How long a kind of data is kept: each has its sentence in «Cuánto tiempo los guardamos». */
export type Retention = 'account' | 'tournament' | 'record' | 'push' | 'short' | 'telemetry' | 'devices'

/** The words of «Cuánto tiempo los guardamos» that state each retention. */
export const RETENTION_WORDS: Record<Retention, string> = {
  account: 'mientras tengas tu cuenta',
  tournament: 'mientras exista el torneo',
  record: 'no tienen fecha de borrado',
  push: 'hasta que apagues los avisos',
  short: 'sirven unos minutos',
  telemetry: '30 días',
  devices: '90 días',
}

export type InventoryEntry =
  | { personal: true; what: string; section: string; retention: Retention }
  | { personal: false; why: string }

const T = (what: string, section: string, retention: Retention): InventoryEntry => ({ personal: true, what, section, retention })
const NONE = (why: string): InventoryEntry => ({ personal: false, why })

const TOURNAMENT = 'Lo que se ve de un torneo'
const CAPTURED = 'Lo que el Comité captura de cada jugador'
const MONEY = 'El dinero de un torneo'
const PROFILE = 'Quién ve tu perfil'
const DATA = 'Qué datos guardamos'
const OPERATOR = 'Quién opera Polo'
const WHERE = 'Dónde viven'

export const DATA_INVENTORY: Record<string, InventoryEntry> = {
  _migrations: NONE('which migrations ran'),
  tournaments: T('name, logo and who created it', TOURNAMENT, 'tournament'),
  tournament_organizers: T('which accounts are its Comité', TOURNAMENT, 'tournament'),
  organizers: T('the organizer account and its display name', DATA, 'account'),
  courses: T('the course and which account loaded it', DATA, 'record'),
  course_documents: T('scorecard photos and PDFs someone uploaded', WHERE, 'record'),
  tees: NONE('a course tee: rating, slope, par'),
  holes: NONE('a course hole: par, stroke index, yards'),
  players: T('name, photo, tier, handicap, the three rounds of an estimate, form guide, which profile it is', CAPTURED, 'tournament'),
  player_pins: T('the PIN, as a hash', CAPTURED, 'tournament'),
  pin_attempts: T('failed PIN tries per device', DATA, 'short'),
  device_sessions: T('which player each phone entered as', DATA, 'tournament'),
  pairs: T('who plays with whom', TOURNAMENT, 'tournament'),
  teams: T('the drawn teams', TOURNAMENT, 'tournament'),
  team_members: T('who is in each team', TOURNAMENT, 'tournament'),
  rounds: T('the days of play', TOURNAMENT, 'tournament'),
  round_tees: T('the tee each player plays each day', TOURNAMENT, 'tournament'),
  groups: T('the groups of each day', TOURNAMENT, 'tournament'),
  group_members: T('who plays in each group', TOURNAMENT, 'tournament'),
  scores: T('strokes, putts and pick-ups per hole, and who entered them', TOURNAMENT, 'tournament'),
  score_mutations: T('the answer the server gave each phone\'s save', DATA, 'tournament'),
  rejected_writes: T('holes the server refused, with the phone that sent them', DATA, 'tournament'),
  snake_tiebreaks: T('who holed out last', TOURNAMENT, 'tournament'),
  card_signatures: T('who signed each card', TOURNAMENT, 'tournament'),
  handicap_overrides: T('a playing handicap the Comité set, and why', CAPTURED, 'tournament'),
  calcutta_lots: T('who bought each player, and for how much', MONEY, 'tournament'),
  calcutta_bids: T('every bid', MONEY, 'tournament'),
  calcutta_buybacks: T('buybacks', MONEY, 'tournament'),
  payments: T('what each person paid and is paid', MONEY, 'tournament'),
  money_adjustments: T('the Comité\'s decisions on unassigned money', MONEY, 'tournament'),
  game_entries: T('who is in each side game', MONEY, 'tournament'),
  hole_awards: T('hole contest winners', TOURNAMENT, 'tournament'),
  game_results: T('the result of a custom bet', MONEY, 'tournament'),
  photos: T('photos of a hole', TOURNAMENT, 'tournament'),
  audit_log: T('every change to holes, players, groups and money, with who made it', DATA, 'record'),
  profiles: T('the profile: name, handle, photo, club, city, bio, index', PROFILE, 'account'),
  profile_link_tokens: T('a one-time token that carries the player of a phone to an account', DATA, 'short'),
  round_results: T('each finished round\'s result per player', PROFILE, 'tournament'),
  tournament_results: T('each finished tournament\'s place per player', PROFILE, 'tournament'),
  tournament_money: T('what each person won or put in a finished tournament', MONEY, 'tournament'),
  friendships: T('friends', PROFILE, 'account'),
  notifications: T('the notices the app sent', DATA, 'account'),
  rivalries: T('rivalries between friends', PROFILE, 'account'),
  rivalry_rounds: T('each round of a rivalry', PROFILE, 'account'),
  crews: T('crews and their codes', PROFILE, 'account'),
  crew_members: T('who is in each crew', PROFILE, 'account'),
  push_subscriptions: T('the address a browser gives to receive notices, and which browser', DATA, 'push'),
  platform_admins: T('who operates Polo', OPERATOR, 'record'),
  platform_unlocks: T('when the operator unlocked a Protegido tournament, and why', OPERATOR, 'record'),
  platform_audit_log: T('what the operator did, and why', OPERATOR, 'record'),
  platform_settings: NONE('the operator\'s switches and banner'),
  backup_runs: NONE('when each nightly backup ran and its size'),
  client_events: T('errors, sync times, speed and a few steps from each phone', DATA, 'telemetry'),
  device_status: T('each phone\'s app version and what it still has to send', DATA, 'devices'),
}

import { DEFAULT_FORMAT_OPTIONS, type TournamentSettings } from './schema'

/**
 * What the platform ships with: individual Stableford only, everything else
 * off. The create wizard turns modules on and fills prizes.
 */
export const DEFAULT_SETTINGS: TournamentSettings = {
  modules: {
    individual: { enabled: true, label: 'Individual', format: 'stableford', formatOptions: DEFAULT_FORMAT_OPTIONS },
    bestRound: { enabled: false, label: 'Mejor ronda' },
    pairs: { enabled: false, label: 'Parejas', pairing: [], honoreePicks: false },
    snake: { enabled: false, label: 'La Víbora', puttsThreshold: 3 },
    fewestPutts: { enabled: false, label: 'Menos putts' },
    auction: { enabled: false, label: 'La Calcutta' },
  },
  tiers: [],
  rounds: 1,
  groupSize: 4,
  labels: { lastPlace: 'Último lugar', honoree: 'Homenajeado', trophy: '' },
  entryFee: 0,
  houseCut: 0,
  // Full handicap and no anti-sandbag cut: the 80% allowance and the 36/2/4
  // cut are the first tournament's rules (§5.2), not the platform's. A
  // `maxStrokes` of 0 is what "no cut" means, so the other two never apply.
  handicap: { allowance: 1, cap: 54, rounding: 'halfUp', perRoundSlope: false, estimateWeights: [0.45, 0.4, 0.15] },
  day2Cut: { threshold: 36, pointsPerStroke: 2, maxStrokes: 0, mode: 'previous' },
  prizes: {
    stableford: [],
    stablefordMode: 'amount',
    pairs: [],
    bestRoundPerDay: 0,
    snakePerSurvivor: 0,
    fewestPutts: 0,
  },
  auction: {
    openingBid: 250,
    increment: 250,
    maxPlayersPerOwner: 3,
    selfOwnedCountsTowardMax: true,
    guestsCanBid: false,
    buybackMaxPct: 50,
    // No tiers by default, so no per-tier slots: enabling the auction on a plain tournament is valid as is.
    payout: [
      { slot: 'place', place: 1, share: 0.7 },
      { slot: 'place', place: 2, share: 0.25 },
      { slot: 'lastPlace', share: 0.05 },
    ],
  },
  games: [],
  pickupPuttsForFewestPutts: 3,
  tieFallback: 'split',
  spectatorLink: false,
  // The create wizard replaces this with the organizer's own zone.
  timezone: 'America/Mexico_City',
  currency: 'MXN',
}

/**
 * The first tournament's configuration (CLAUDE.md §5, §18): Nacho's Bachelor
 * Invitational, Los Cabos, 12 players, 2 rounds. These are that tournament's
 * defaults, not constants of the platform.
 */
export const FIRST_TOURNAMENT_SETTINGS: TournamentSettings = {
  modules: {
    individual: { enabled: true, label: 'Individual', format: 'stableford', formatOptions: DEFAULT_FORMAT_OPTIONS },
    bestRound: { enabled: true, label: 'Mejor ronda' },
    pairs: {
      enabled: true,
      label: 'Los Matrimonios',
      pairing: [
        ['A', 'D'],
        ['B', 'C'],
      ],
      honoreePicks: true,
    },
    snake: { enabled: true, label: 'La Víbora', puttsThreshold: 3 },
    fewestPutts: { enabled: true, label: 'Menos putts' },
    auction: { enabled: true, label: 'La Calcutta' },
  },
  tiers: ['A', 'B', 'C', 'D'],
  rounds: 2,
  groupSize: 4,
  labels: { lastPlace: 'La Cuchara de Palo', honoree: 'El novio', trophy: 'el Putter' },
  entryFee: 2500,
  houseCut: 0,
  handicap: { allowance: 0.8, cap: 54, rounding: 'halfUp', perRoundSlope: false, estimateWeights: [0.45, 0.4, 0.15] },
  day2Cut: { threshold: 36, pointsPerStroke: 2, maxStrokes: 4, mode: 'previous' },
  prizes: {
    stableford: [10000, 5000, 3000, 2000],
    stablefordMode: 'amount',
    pairs: [2000, 1000],
    bestRoundPerDay: 1200,
    snakePerSurvivor: 200,
    fewestPutts: 1000,
  },
  auction: {
    openingBid: 250,
    increment: 250,
    maxPlayersPerOwner: 3,
    selfOwnedCountsTowardMax: true,
    guestsCanBid: false,
    buybackMaxPct: 50,
    payout: [
      { slot: 'place', place: 1, share: 0.55 },
      { slot: 'place', place: 2, share: 0.2 },
      { slot: 'bestOfTier', tier: 'C', share: 0.1 },
      { slot: 'bestOfTier', tier: 'D', share: 0.1 },
      { slot: 'lastPlace', share: 0.05 },
    ],
  },
  games: [],
  pickupPuttsForFewestPutts: 3,
  tieFallback: 'split',
  spectatorLink: false,
  timezone: 'America/Mazatlan',
  currency: 'MXN',
}

/** Field size of the first tournament; used by the prize-sum check in tests and seeds. */
export const FIRST_TOURNAMENT_PLAYER_COUNT = 12

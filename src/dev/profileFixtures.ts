/**
 * Profile fixtures for `/p/_/:name` (design routes only): the profile screen
 * in the states a real account passes through, with no database.
 */
import type { MoneyLine, ProfileCard, ProfileTournament, RoundResult } from '../data/profiles'

const base: ProfileCard = {
  handle: 'andrea.solis',
  displayName: 'Andrea Solís',
  avatarUrl: null,
  homeClub: 'Club de Golf Chapultepec',
  city: 'Ciudad de México',
  index: 12.4,
  indexSource: 'polo',
  indexRounds: 14,
  isMe: true,
  related: true,
  fullName: 'Andrea Solís Treviño',
  bio: 'Pego derecho, pateo chueco. Siempre en el último grupo.',
  memberSince: '2026-09-01T12:00:00Z',
}

const tournament = (name: string, slug: string, status: ProfileTournament['status'], extra: Partial<ProfileTournament> = {}): ProfileTournament => ({
  tournamentId: `t-${slug}`,
  slug,
  name,
  logoUrl: null,
  status,
  practice: false,
  playerId: `p-${slug}`,
  displayName: 'Andrea',
  startsOn: null,
  rank: null,
  rankLabel: null,
  field: null,
  points: null,
  awards: [],
  ...extra,
})

const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5]

/** A plausible card for a gross: bogeys on the hardest holes (stroke index = hole number here). */
function card(gross: number): RoundResult['detail'] {
  const over = gross - 72
  return PARS.map((par, i) => {
    const extra = Math.floor(over / 18) + (i + 1 <= over % 18 ? 1 : 0)
    return [i + 1, par, i + 1, par + extra, extra > 1 ? 3 : 2, false]
  })
}

/** Newest first. The best 4 of these 14 (11.8, 12.2, 12.6, 13.0) average 12.4, the card's index. */
const DIFFS = [15.1, 11.8, 16.4, 12.2, 18.0, 14.3, 12.6, 19.2, 13.0, 15.5, 17.1, 14.8, 16.0, 20.3]
const COURSES = ['Chapultepec', 'Club Campestre', 'Bosque Real', 'La Hacienda']

function round(i: number, diff: number | null, extra: Partial<RoundResult> = {}): RoundResult {
  const gross = diff == null ? 94 : Math.round((diff * 128) / 113 + 71.2)
  const d = new Date(Date.UTC(2026, 8, 26 - i * 7))
  return {
    roundId: `r${i}`,
    tournamentId: 't-sabados',
    slug: 'sabados',
    tournament: 'Sábados en Chapultepec',
    practice: false,
    playedOn: d.toISOString().slice(0, 10),
    roundNumber: 1,
    holes: 18,
    complete: true,
    course: COURSES[i % COURSES.length]!,
    tee: 'Azules',
    rating: 71.2,
    slope: 128,
    par: 72,
    courseHcp: 14,
    gross,
    ags: gross,
    differential: diff,
    putts: 32,
    eagles: 0,
    birdies: i % 3 === 0 ? 2 : 1,
    pars: 8,
    bogeys: 7,
    doubles: 2,
    pickups: 0,
    detail: card(gross),
    ...extra,
  }
}

const money: MoneyLine[] = [
  { tournamentId: 't-primavera', slug: 'primavera', name: 'Invitacional de Primavera', net: 1500, currency: 'MXN', publishedAt: '2026-06-01T00:00:00Z', practice: false },
  { tournamentId: 't-otono', slug: 'otono', name: 'Copa de Otoño', net: -2500, currency: 'MXN', publishedAt: '2026-03-01T00:00:00Z', practice: false },
  { tournamentId: 't-sabados', slug: 'sabados', name: 'Sábados en Chapultepec', net: 700, currency: 'MXN', publishedAt: '2026-09-20T00:00:00Z', practice: false },
]

export const PROFILE_FIXTURES: Record<string, { card: ProfileCard; tournaments?: ProfileTournament[]; rounds?: RoundResult[]; money?: MoneyLine[] }> = {
  /** My profile after a season: index, strip, finishes, history (one practice round, one incomplete), money. */
  yo: {
    card: base,
    tournaments: [
      tournament('Sábados en Chapultepec', 'sabados', 'live'),
      tournament('Invitacional de Primavera', 'primavera', 'finished', { rank: 1, rankLabel: '1', field: 12, points: 76, awards: ['prize:Individual, 1.er lugar'] }),
      tournament('Copa de Otoño', 'otono', 'finished', { rank: 3, rankLabel: 'T3', field: 16, points: 71, awards: ['award:mostBirdies'] }),
      tournament('Ensayo', 'ensayo', 'finished', { practice: true }),
    ],
    rounds: [
      ...DIFFS.slice(0, 2).map((d, i) => round(i, d)),
      round(90, 9.4, { practice: true, tournament: 'Ensayo', slug: 'ensayo', course: 'Solmar' }),
      round(91, null, { complete: false, gross: null, ags: null, course: 'Quivira' }),
      ...DIFFS.slice(2).map((d, i) => round(i + 2, d)),
    ],
    money,
  },
  /** Just created: no index yet, no bio, no tournaments, no rounds. */
  nuevo: {
    card: { ...base, handle: 'tomas.rivera', displayName: 'Tomás Rivera', homeClub: null, city: null, index: null, indexRounds: 0, bio: null, fullName: null },
    tournaments: [],
    rounds: [],
    money: [],
  },
  /** Someone else, seen by a stranger with an account: the card only. */
  extrano: {
    card: { ...base, handle: 'julian.tg', displayName: 'Julián Treviño Garza de la Fuente', isMe: false, related: false, bio: null, fullName: null, index: 8.1, indexRounds: 20 },
  },
  /** A plus handicap declared by hand, seen by a tournament mate. */
  manual: {
    card: { ...base, handle: 'pablo.ibarra', displayName: 'Pablo Ibarra', isMe: false, related: true, index: -1.2, indexSource: 'manual', bio: 'Scratch en los buenos días.' },
    tournaments: [tournament('Copa de Otoño', 'otono', 'finished', { rank: 1, rankLabel: '1', field: 16, points: 82, displayName: 'Pablo' })],
    rounds: [round(0, -0.8, { gross: 71, ags: 71 }), round(1, 1.4, { gross: 74, ags: 74 })],
  },
}

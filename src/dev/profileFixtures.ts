/**
 * Profile fixtures for `/p/_/:name` (design routes only): the profile screen
 * in the states a real account passes through, with no database.
 */
import type { MyLink, ProfileCard } from '../data/profiles'

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

const link = (name: string, slug: string, status: MyLink['tournamentStatus'], linkStatus: MyLink['linkStatus'] = 'confirmed'): MyLink => ({
  playerId: `p-${slug}`,
  displayName: 'Andrea',
  linkStatus,
  tournamentId: `t-${slug}`,
  slug,
  name,
  tournamentStatus: status,
  logoUrl: null,
  createdAt: '2026-09-01T12:00:00Z',
})

export const PROFILE_FIXTURES: Record<string, { card: ProfileCard; tournaments?: MyLink[] }> = {
  /** My profile after a season: index, bio, tournaments. */
  yo: {
    card: base,
    tournaments: [
      link('Sábados en Chapultepec', 'sabados', 'live'),
      link('Invitacional de Primavera', 'primavera', 'setup', 'pending'),
      link('Copa de Otoño', 'otono', 'finished'),
      link('Ensayo', 'ensayo', 'finished'),
    ],
  },
  /** Just created: no index yet, no bio, no tournaments. */
  nuevo: {
    card: { ...base, handle: 'tomas.rivera', displayName: 'Tomás Rivera', homeClub: null, city: null, index: null, indexRounds: 0, bio: null, fullName: null },
    tournaments: [],
  },
  /** Someone else, seen by a stranger with an account: the card only. */
  extrano: {
    card: { ...base, handle: 'julian.tg', displayName: 'Julián Treviño Garza de la Fuente', isMe: false, related: false, bio: null, fullName: null, index: 8.1, indexRounds: 20 },
  },
  /** A plus handicap declared by hand. */
  manual: {
    card: { ...base, handle: 'pablo.ibarra', displayName: 'Pablo Ibarra', isMe: false, related: true, index: -1.2, indexSource: 'manual', bio: 'Scratch en los buenos días.' },
  },
}

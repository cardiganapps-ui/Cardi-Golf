/**
 * `/admin/_/…` (dev and preview builds only): the Admin de Polo panel on an
 * in-memory API, so it can be designed and screenshotted without an admin
 * account. Numbers are invented but shaped like Polo's real ones.
 */
import { PlatformApiContext, type Person, type PersonRow, type PlatformApi, type PlatformDay, type PlatformTournament, type PlatformTournamentRow } from '../data/platform'
import { PlatformLayout } from '../screens/platform'

const now = Date.now()
const ago = (h: number) => new Date(now - h * 3600_000).toISOString()
const dayIso = (d: number) => new Date(now - d * 86400_000).toISOString().slice(0, 10)

const ROWS: PlatformTournamentRow[] = [
  { id: 'f-nacho', slug: 'nacho-invitational', name: "Nacho's Bachelor Invitational", status: 'setup', joinCode: 'NACHO7', logoUrl: null, quick: false, practice: false, protected: true, crewName: null, createdAt: ago(24 * 20), players: 12, rounds: 2, organizers: 2, ownerName: 'Diego Arámburu', ownerEmail: 'diego@example.com', lastActivityAt: ago(5) },
  { id: 'f-ensayo', slug: 'ensayo', name: 'Ensayo', status: 'live', joinCode: 'ENSAY0', logoUrl: null, quick: false, practice: true, protected: false, crewName: null, createdAt: ago(24 * 12), players: 12, rounds: 2, organizers: 1, ownerName: 'Diego Arámburu', ownerEmail: 'diego@example.com', lastActivityAt: ago(0.4) },
  { id: 'f-quick', slug: 'ronda-chapultepec-4k2', name: 'Ronda en Chapultepec', status: 'finished', joinCode: 'QK4K2P', logoUrl: null, quick: true, practice: false, protected: false, crewName: 'Los del jueves', createdAt: ago(50), players: 4, rounds: 1, organizers: 1, ownerName: 'Mauricio Lozano', ownerEmail: 'mau@example.com', lastActivityAt: ago(46) },
  { id: 'f-orphan', slug: 'copa-sin-dueno', name: 'Copa de Otoño de un Organizador con un Nombre Larguísimo', status: 'setup', joinCode: 'OTONO2', logoUrl: null, quick: false, practice: false, protected: false, crewName: null, createdAt: ago(24 * 40), players: 0, rounds: 0, organizers: 0, ownerName: null, ownerEmail: null, lastActivityAt: null },
]

const PEOPLE: PersonRow[] = [
  { id: 'p-diego', email: 'diego@example.com', anonymous: false, provider: 'google', handle: 'diego', displayName: 'Diego Arámburu', avatarUrl: null, devicePlayer: null, deviceTournament: null, createdAt: ago(24 * 60), lastSignInAt: ago(1), blocked: false, isAdmin: true, tournaments: 3 },
  { id: 'p-mau', email: 'mau@example.com', anonymous: false, provider: 'email', handle: 'mau.lozano', displayName: 'Mauricio Lozano', avatarUrl: null, devicePlayer: null, deviceTournament: null, createdAt: ago(24 * 9), lastSignInAt: ago(30), blocked: false, isAdmin: false, tournaments: 2 },
  { id: 'p-spam', email: 'vendo.pelotas.baratas.con.un.correo.larguisimo@example.com', anonymous: false, provider: 'email', handle: null, displayName: null, avatarUrl: null, devicePlayer: null, deviceTournament: null, createdAt: ago(24 * 2), lastSignInAt: ago(40), blocked: true, isAdmin: false, tournaments: 0 },
  { id: 'p-phone', email: null, anonymous: true, provider: 'anonymous', handle: null, displayName: null, avatarUrl: null, devicePlayer: 'René', deviceTournament: 'Ensayo', createdAt: ago(24 * 5), lastSignInAt: ago(3), blocked: false, isAdmin: false, tournaments: 1 },
]

function person(id: string): Person | null {
  const r = PEOPLE.find((x) => x.id === id)
  if (!r) return null
  return {
    id: r.id, email: r.email, anonymous: r.anonymous, provider: r.provider, providers: [r.provider], createdAt: r.createdAt, lastSignInAt: r.lastSignInAt,
    confirmedAt: r.anonymous ? null : r.createdAt, blocked: r.blocked, isAdmin: r.isAdmin, isSelf: r.id === 'p-diego',
    profile: r.handle ? { handle: r.handle, displayName: r.displayName ?? r.handle, fullName: r.displayName, avatarUrl: null, homeClub: 'Club Campestre', city: 'CDMX', discoverable: true, index: 14.2, indexSource: 'polo', createdAt: r.createdAt } : null,
    tournaments: r.anonymous
      ? [{ tournamentId: 'f-ensayo', slug: 'ensayo', name: 'Ensayo', status: 'live', quick: false, practice: true, createdAt: ago(24 * 12), role: null, playerId: 'pl-rene', playerName: 'René', link: 'device' }]
      : r.tournaments
        ? [
            { tournamentId: 'f-quick', slug: 'ronda-chapultepec-4k2', name: 'Ronda en Chapultepec', status: 'finished', quick: true, practice: false, createdAt: ago(50), role: 'owner', playerId: 'pl-mau', playerName: 'Mauricio', link: 'confirmed' },
            { tournamentId: 'f-ensayo', slug: 'ensayo', name: 'Ensayo', status: 'live', quick: false, practice: true, createdAt: ago(24 * 12), role: null, playerId: 'pl-mau2', playerName: 'Mauricio L.', link: 'pending' },
          ]
        : [],
    crews: r.anonymous ? [] : [{ id: 'c1', slug: 'jueves', name: 'Los del jueves', role: 'owner', members: 6 }],
    friends: r.anonymous ? 0 : 4,
    pendingFriends: r.anonymous ? 0 : 1,
    push: { count: r.anonymous ? 0 : 1, hosts: r.anonymous ? [] : ['web.push.apple.com'] },
    deviceLock: r.anonymous ? { failed: 5, lockedUntil: new Date(now + 4 * 60_000).toISOString() } : null,
    playerLocks: r.anonymous ? [{ playerId: 'pl-rene', name: 'René', tournament: 'Ensayo', failed: 3, lockedUntil: null }] : [],
    activity: r.blocked ? [{ id: 9, at: ago(20), action: 'block', reason: 'Mandaba spam a todos' }] : [],
  }
}

const daily: PlatformDay[] = Array.from({ length: 30 }, (_, i) => {
  const d = 29 - i
  const wave = Math.round(40 + 35 * Math.sin(i / 3) + (i % 7 === 5 ? 90 : 0))
  return { day: dayIso(d), accounts: i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0, tournaments: i === 12 || i === 27 ? 1 : 0, quickRounds: i % 6 === 0 ? 1 : 0, rounds: i % 7 === 5 ? 2 : 0, scores: i % 7 === 5 ? wave * 3 : i < 5 ? 0 : wave }
})

function detail(id: string): PlatformTournament | null {
  const r = ROWS.find((x) => x.id === id)
  if (!r) return null
  return {
    ...r,
    tagline: null,
    timezone: 'America/Mazatlan',
    currency: 'MXN',
    crew: r.crewName ? { id: 'c1', slug: 'jueves', name: r.crewName } : null,
    unlockedUntil: null,
    organizers: r.ownerEmail ? [{ userId: 'u1', role: 'owner', email: r.ownerEmail, name: r.ownerName ?? r.ownerEmail, handle: null }, ...(r.organizers > 1 ? [{ userId: 'u2', role: 'admin' as const, email: 'nico@example.com', name: 'Nicolás Castro', handle: 'nico' }] : [])] : [],
    rounds: Array.from({ length: r.rounds }, (_, i) => ({ id: `r${i}`, number: i + 1, date: dayIso(-190 + i), status: r.status === 'live' && i === 0 ? 'live' : r.status === 'finished' ? 'finished' : 'scheduled', course: i === 0 ? 'Solmar Golf Links' : 'Quivira Los Cabos', scores: r.status === 'setup' ? 0 : 216 })),
    counts: { players: r.players, linked: Math.floor(r.players / 2), devices: r.players - 2, groups: r.rounds * 3, payments: r.players, disputes: r.id === 'f-ensayo' ? 2 : 0 },
    audit: [
      { id: 3, at: ago(0.4), table: 'scores', action: 'UPDATE', platform: true, actor: null, reason: 'Corrección reportada por el grupo 2' },
      { id: 2, at: ago(3), table: 'players', action: 'UPDATE', platform: false, actor: 'Nicolás', reason: null },
      { id: 1, at: ago(26), table: 'rounds', action: 'INSERT', platform: false, actor: 'Diego', reason: null },
    ],
  }
}

const api: PlatformApi = {
  async overview() {
    return {
      accounts: 38, accounts7d: 5, devices: 69, profiles: 36, pushProfiles: 14, tournaments: 3, quickRounds: 9,
      byStatus: { setup: 2, live: 1, finished: 9 }, live: 1, practice: 1, protected: 1, roundsFinished: 21, rounds30d: 8,
      scores30d: 3412, crews: 2, courses: 7,
      recent: [
        { kind: 'platform', at: ago(0.4), id: 'p1', label: 'unlock', targetKind: 'tournament', tournamentId: 'f-nacho', reason: 'Corregir un hoyo que reportaron' },
        { kind: 'profile', at: ago(2), id: 'u9', label: 'René Nosti', handle: 'rene' },
        { kind: 'tournament', at: ago(50), id: 'f-quick', label: 'Ronda en Chapultepec', quick: true },
        { kind: 'profile', at: ago(26), id: 'u8', label: 'Emiliano Garzón', handle: 'emi.garzon' },
      ],
    }
  },
  async daily() {
    return daily
  },
  async tournaments({ q, kind }) {
    const needle = (q ?? '').toLowerCase()
    const rows = ROWS.filter((r) => {
      if (needle && !`${r.name} ${r.slug} ${r.joinCode} ${r.ownerEmail ?? ''}`.toLowerCase().includes(needle)) return false
      switch (kind) {
        case 'quick': return r.quick
        case 'crew': return !!r.crewName
        case 'practice': return r.practice
        case 'protected': return r.protected
        case 'orphan': return r.organizers === 0
        case 'real': return !r.quick && !r.practice
        default: return true
      }
    })
    return { total: rows.length, rows }
  },
  async tournament(id) {
    return detail(id)
  },
  async unlock() {
    return new Date(now + 30 * 60_000).toISOString()
  },
  async relock() {},
  async setProtected() {},
  async people({ q, filter }) {
    const needle = (q ?? '').toLowerCase()
    const rows = PEOPLE.filter((r) => {
      if (needle && !`${r.email ?? ''} ${r.handle ?? ''} ${r.displayName ?? ''} ${r.devicePlayer ?? ''}`.toLowerCase().includes(needle)) return false
      if (filter === 'accounts') return !r.anonymous
      if (filter === 'devices') return r.anonymous
      if (filter === 'blocked') return r.blocked
      return true
    })
    return { total: rows.length, rows }
  },
  async person(id) {
    return person(id)
  },
  async deletePreview() {
    return { orphaned: [{ id: 'f-orphan', name: 'Copa de Otoño' }], organizerOf: 1, linkedPlayers: 2, crewsHanded: ['Los del jueves'], crewsDeleted: [], friendships: 4, rivalries: 1, notifications: 12, push: 1, hasProfile: true }
  },
  async block() {},
  async unblock() {},
  async deleteAccount() {},
  async resetPinLock() {},
  async setOrganizer() {},
  async unlinkPlayer() {},
}

export function PlatformFixture() {
  return (
    <PlatformApiContext.Provider value={api}>
      <PlatformLayout />
    </PlatformApiContext.Provider>
  )
}

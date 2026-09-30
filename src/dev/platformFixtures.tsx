/**
 * `/admin/_/…` (dev and preview builds only): the Admin de Polo panel on an
 * in-memory API, so it can be designed and screenshotted without an admin
 * account. Numbers are invented but shaped like Polo's real ones.
 */
import { PlatformApiContext, type CourseRow, type CourseTee, type CrewRow, type Person, type PersonRow, type PlatformApi, type PlatformCourse, type PlatformDay, type PlatformTournament, type PlatformTournamentRow } from '../data/platform'
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

const COURSES: CourseRow[] = [
  { id: 'c-quivira', name: 'Quivira Golf Club', location: 'Cabo San Lucas', source: 'golfcourseapi', createdAt: ago(24 * 30), creatorEmail: 'diego@example.com', tees: 5, rounds: 1, tournaments: 1, dupeKey: 'quivira', dupes: 1, broken: false },
  { id: 'c-quivira2', name: 'Quivira Los Cabos', location: null, source: 'manual', createdAt: ago(24 * 3), creatorEmail: 'mau@example.com', tees: 1, rounds: 1, tournaments: 1, dupeKey: 'quiviraloscabos', dupes: 1, broken: false },
  { id: 'c-solmar', name: 'Solmar Golf Links', location: 'Cabo San Lucas', source: 'scorecard_photo', createdAt: ago(24 * 29), creatorEmail: 'diego@example.com', tees: 2, rounds: 1, tournaments: 1, dupeKey: 'solmar', dupes: 0, broken: true },
  { id: 'c-chapu', name: 'Club de Golf Chapultepec', location: 'CDMX', source: 'manual', createdAt: ago(24 * 10), creatorEmail: 'mau@example.com', tees: 1, rounds: 0, tournaments: 0, dupeKey: 'chapultepec', dupes: 0, broken: false },
]

const holes18 = (tweak?: (h: { n: number; par: number; si: number }) => { n: number; par: number; si: number }) =>
  Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5][i]!, si: [7, 11, 17, 1, 9, 3, 15, 13, 5, 8, 16, 2, 6, 12, 4, 18, 10, 14][i]! })).map((h) => (tweak ? tweak(h) : h))

function courseDetail(id: string): PlatformCourse | null {
  const c = COURSES.find((x) => x.id === id)
  if (!c) return null
  const tee = (tid: string, name: string, inUse: number, holes = holes18(), problems: CourseTee['problems'] = []): CourseTee => ({
    id: tid, name, color: null, rating: 72.1, slope: 131, parTotal: holes.reduce((s, h) => s + h.par, 0), problems, inUse, holes,
  })
  const tees =
    id === 'c-solmar'
      ? [tee('t-s1', 'Azules', 12), tee('t-s2', 'Blancas', 0, holes18((h) => (h.n === 18 ? { ...h, si: 1 } : h)), ['si'])]
      : id === 'c-quivira2'
        ? [tee('t-q21', 'azules', 12)]
        : [tee(`${id}-a`, 'Azules', c.rounds ? 12 : 0), tee(`${id}-b`, 'Blancas', 0)]
  return {
    id: c.id, name: c.name, location: c.location, source: c.source, attribution: null, website: null, createdAt: c.createdAt, creatorEmail: c.creatorEmail,
    tees,
    usedBy: c.rounds ? [{ tournamentId: 'f-nacho', name: "Nacho's Bachelor Invitational", status: 'setup', protected: true, rounds: c.rounds }] : [],
    dupes: COURSES.filter((d) => d.id !== c.id && c.dupes > 0 && d.dupes > 0).map((d) => ({ id: d.id, name: d.name, location: d.location, rounds: d.rounds })),
  }
}

const CREWS: CrewRow[] = [
  { id: 'k-jueves', slug: 'los-del-jueves', name: 'Los del jueves', createdAt: ago(24 * 40), ownerName: 'Mauricio Lozano', members: 6, outings: 4, lastOutingAt: ago(50) },
  { id: 'k-solo', slug: 'crew-de-uno', name: 'Crew de uno', createdAt: ago(24 * 2), ownerName: 'René', members: 1, outings: 0, lastOutingAt: null },
]

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
  async courses({ q, filter }) {
    const needle = (q ?? '').toLowerCase()
    const rows = COURSES.filter((c) => {
      if (needle && !`${c.name} ${c.location ?? ''}`.toLowerCase().includes(needle)) return false
      if (filter === 'dupes') return c.dupes > 0
      if (filter === 'broken') return c.broken
      if (filter === 'unused') return c.rounds === 0
      return true
    })
    return { total: rows.length, rows }
  },
  async course(id) {
    return courseDetail(id)
  },
  async refreshCourse() {
    return 3
  },
  async mergeCourses() {
    return { rounds: 1, refreshed: 1 }
  },
  async deleteCourse() {},
  async crews({ q }) {
    const rows = CREWS.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    return { total: rows.length, rows }
  },
  async crew(id) {
    const c = CREWS.find((x) => x.id === id)
    if (!c) return null
    return {
      id: c.id, slug: c.slug, name: c.name, joinCode: 'JUEV3S', createdAt: c.createdAt, ownerId: 'p-mau',
      members: [
        { profileId: 'p-mau', handle: 'mau.lozano', displayName: 'Mauricio Lozano', avatarUrl: null, role: 'owner', joinedAt: c.createdAt },
        { profileId: 'p-diego', handle: 'diego', displayName: 'Diego Arámburu', avatarUrl: null, role: 'member', joinedAt: ago(24 * 20) },
      ],
      outings: [{ tournamentId: 'f-quick', name: 'Ronda en Chapultepec', status: 'finished', quick: true, practice: false, createdAt: ago(50) }],
      activity: [],
    }
  },
  async removeCrewMember() {
    return 'handed'
  },
  async deleteCrew() {},
  async audience() {
    return {
      profiles: 36,
      push: 14,
      sentToday: 1,
      recent: [
        { id: 2, at: ago(3), title: 'Nueva versión de Polo', body: 'Ya puedes ver tu historial en el Comité.', to: null, toName: null, count: 36 },
        { id: 1, at: ago(26), title: 'Tu PIN', body: 'Ya te quité el bloqueo; vuelve a entrar.', to: 'p-phone', toName: 'René', count: 1 },
      ],
    }
  },
  async broadcast(_t, _b, to) {
    return to ? 1 : 36
  },
  async audit({ source }) {
    const rows = [
      { source: 'platform' as const, id: 12, at: ago(0.4), action: 'unlock', targetKind: 'tournament', targetId: 'f-nacho', tournamentId: 'f-nacho', tournament: "Nacho's Bachelor Invitational", reason: 'Corregir un hoyo que reportaron', actor: 'Diego Arámburu' },
      { source: 'comite' as const, id: 9001, at: ago(0.35), action: 'UPDATE', table: 'scores', rowId: 'x', tournamentId: 'f-nacho', tournament: "Nacho's Bachelor Invitational", reason: 'Corrección reportada por el grupo 2', actor: 'Diego Arámburu' },
      { source: 'platform' as const, id: 11, at: ago(20), action: 'block', targetKind: 'person', targetId: 'p-spam', tournamentId: null, tournament: null, reason: 'Mandaba spam a todos', actor: 'Diego Arámburu' },
      { source: 'platform' as const, id: 10, at: ago(26), action: 'broadcast', targetKind: 'notice', targetId: 'k', tournamentId: null, tournament: null, reason: null, actor: 'Diego Arámburu', detail: 'Nueva versión de Polo' },
    ]
    return rows.filter((r) => !source || source === 'all' || r.source === source)
  },
  async auditEntry(source, id) {
    return source === 'platform'
      ? { source, id, at: ago(0.4), action: 'unlock', targetKind: 'tournament', targetId: 'f-nacho', tournamentId: 'f-nacho', reason: 'Corregir un hoyo que reportaron', payload: { until: ago(-0.5) } }
      : { source, id, at: ago(0.35), action: 'UPDATE', table: 'scores', tournamentId: 'f-nacho', reason: 'Corrección', before: { strokes: 6, putts: 2 }, after: { strokes: 5, putts: 2 } }
  },
  async health() {
    return {
      backup: {
        last: { at: ago(14), ok: true, key: 'backups/2026-09-30.json.gz', bytes: 88_210, tables: 34, rows: 36_412, error: null },
        lastOk: { at: ago(14), key: 'backups/2026-09-30.json.gz', bytes: 88_210, tables: 34, rows: 36_412 },
        week: { ok: 6, failed: 1 },
      },
      push: { configured: true, subscriptions: 17, profiles: 14, recent: { total: 9, failed: 1, since: ago(5) } },
      database: { lastMigration: { name: '0024_platform_ops.sql', at: ago(2) }, notifications24h: 41 },
      people: { blocked: 1, deviceLocks: 1, playerLocks: 0 },
      flags: { newAccountsPaused: false, newTournamentsPaused: false, maintenanceBanner: null },
    }
  },
  async setFlag(key, value) {
    return {
      newAccountsPaused: key === 'new_accounts_paused' && value === true,
      newTournamentsPaused: key === 'new_tournaments_paused' && value === true,
      maintenanceBanner: key === 'maintenance_banner' && typeof value === 'string' ? value : null,
    }
  },
}

export function PlatformFixture() {
  return (
    <PlatformApiContext.Provider value={api}>
      <PlatformLayout />
    </PlatformApiContext.Provider>
  )
}

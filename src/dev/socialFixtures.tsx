/**
 * Social fixtures (design routes only): `/amigos/_`, `/avisos/_` and
 * `/p/_/:name/vs` on in-memory data, for screenshots with no database.
 */
import { useParams } from 'react-router'
import type { FriendCard, HeadToHead, MyFriends, Notice } from '../data/social'
import { FriendsScreen } from '../screens/profile/FriendsScreen'
import { InboxScreen } from '../screens/profile/InboxScreen'
import { VersusScreen, type VersusFixture } from '../screens/profile/VersusScreen'
import { QuickRoundView, type QuickTee } from '../screens/profile/QuickRoundScreen'
import { PROFILE_FIXTURES } from './profileFixtures'

const person = (displayName: string, handle: string, extra: Partial<FriendCard> = {}): FriendCard => ({ handle, displayName, avatarUrl: null, homeClub: null, index: null, ...extra })

const friends: MyFriends = {
  friends: [person('Diego Ortiz', 'diego.ortiz', { homeClub: 'Bosque Real', index: 9.8 }), person('Mauricio Lozano', 'mau', { index: 21.3 }), person('René Nosti', 'rene.n', { homeClub: 'Chapultepec', index: 14.0 })],
  incoming: [person('Justo Fernández', 'justo', { homeClub: 'Club Campestre', index: 17.2 })],
  outgoing: [person('Rodrigo Vega', 'rodrigo.v')],
  suggestions: [person('Martín Álvarez', 'martin.a', { shared: 2 }), person('Emiliano Garzón', 'emi.g', { shared: 1 })],
}

const ago = (h: number) => new Date(Date.UTC(2026, 8, 28, 18) - h * 3_600_000).toISOString()
const actor = (displayName: string, handle: string) => ({ displayName, handle, avatarUrl: null })
const notices: Notice[] = [
  { id: 'n1', kind: 'friend_request', data: {}, read: false, createdAt: ago(1), actor: actor('Justo Fernández', 'justo') },
  { id: 'n2', kind: 'rivalry_round', data: { rivalryId: 'r1' }, read: false, createdAt: ago(5), actor: actor('Diego Ortiz', 'diego.ortiz') },
  { id: 'n3', kind: 'results', data: { tournament: 'Copa Otoño', slug: 'copa-otono', rankLabel: 'T3', field: 16 }, read: true, createdAt: ago(30), actor: null },
  { id: 'n4', kind: 'link_pending', data: { tournament: 'Sábado en Chapultepec', player: 'Andrea' }, read: true, createdAt: ago(50), actor: null },
  { id: 'n5', kind: 'friend_accepted', data: {}, read: true, createdAt: ago(80), actor: actor('René Nosti', 'rene.n') },
]

const round = (i: number, myAgs: number, theirAgs: number, myCh: number, theirCh: number, pickup = false) => ({
  roundId: `vr${i}`,
  playedOn: `2026-0${9 - Math.floor(i / 3)}-${String(20 - (i % 3) * 6).padStart(2, '0')}`,
  roundNumber: 1,
  course: ['Chapultepec', 'Bosque Real', 'Club Campestre'][i % 3]!,
  practice: false,
  tournament: 'Sábados',
  slug: 'sabados',
  myGross: myAgs,
  theirGross: pickup ? null : theirAgs,
  myAgs,
  theirAgs,
  myNet: myAgs - myCh,
  theirNet: theirAgs - theirCh,
})
const sharedRounds = [round(0, 86, 80, 12, 8), round(1, 84, 83, 12, 8), round(2, 90, 81, 13, 8, true), round(3, 85, 84, 13, 9), round(4, 88, 79, 13, 9)]

const active: HeadToHead = {
  rounds: sharedRounds,
  suggestion: 3,
  friends: true,
  rivalry: {
    id: 'r1',
    status: 'active',
    iProposed: true,
    cap: 18,
    myStrokes: 4,
    startStrokes: 3,
    startedAt: '2026-08-01T12:00:00Z',
    history: [
      { roundId: 'vr0', playedOn: '2026-09-20', myAgs: 86, theirAgs: 80, result: 'lost', before: 3, after: 4 },
      { roundId: 'vr1', playedOn: '2026-09-14', myAgs: 84, theirAgs: 83, result: 'won', before: 4, after: 3 },
      { roundId: 'vr3', playedOn: '2026-08-20', myAgs: 85, theirAgs: 84, result: 'lost', before: 2, after: 3 },
    ],
  },
}

const VERSUS: Record<string, HeadToHead> = {
  rivalidad: active,
  propuesta: { ...active, rivalry: { ...active.rivalry!, status: 'pending', iProposed: false, history: [], startedAt: null, myStrokes: 3 } },
  amigos: { ...active, rivalry: null },
  nuevo: { rounds: [], suggestion: null, friends: true, rivalry: null },
}

const quickCourses = [
  { id: 'c1', name: 'Club de Golf Chapultepec', location: 'Ciudad de México' },
  { id: 'c2', name: 'Bosque Real', location: 'Huixquilucan' },
]
const quickTees = async (): Promise<QuickTee[]> => [
  { id: 't1', name: 'Azules', rating: 72.1, slope: 131, holes: 18 },
  { id: 't2', name: 'Blancas', rating: 70.4, slope: 125, holes: 18 },
]

export function QuickFixture() {
  const me = PROFILE_FIXTURES.yo!.card
  return <QuickRoundView me={{ displayName: me.displayName, avatarUrl: me.avatarUrl, index: me.index }} friends={friends.friends} courses={quickCourses} loadTees={quickTees} onStart={async () => undefined} />
}

export function FriendsFixture() {
  return <FriendsScreen fixture={friends} />
}

export function InboxFixture() {
  return <InboxScreen fixture={notices} />
}

export function VersusFixtureScreen() {
  const { name = 'rivalidad' } = useParams()
  const me = PROFILE_FIXTURES.yo!.card
  const them = { ...PROFILE_FIXTURES.extrano!.card, displayName: 'Diego Ortiz', handle: 'diego.ortiz', related: true, isMe: false }
  const fixture: VersusFixture = { me: { displayName: me.displayName, avatarUrl: me.avatarUrl }, them, h2h: VERSUS[name] ?? active }
  return <VersusScreen fixture={fixture} />
}

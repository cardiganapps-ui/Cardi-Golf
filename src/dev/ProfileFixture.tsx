/** `/p/_/:name` (design routes only, `app/devRoutes.tsx`): the profile on fixture data. */
import { useParams } from 'react-router'
import { ProfileView } from '../screens/profile/ProfileScreen'
import { PROFILE_FIXTURES } from './profileFixtures'

export function ProfileFixture() {
  const { name = 'yo' } = useParams()
  const f = PROFILE_FIXTURES[name] ?? PROFILE_FIXTURES.yo!
  return <ProfileView card={f.card} tournaments={f.tournaments} rounds={f.rounds} money={f.money} />
}

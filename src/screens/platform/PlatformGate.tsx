/**
 * `/admin`: only the platform admin gets past this. Anyone else sees «no
 * encontrado», so the section does not announce itself; the RPCs behind it
 * refuse them anyway. Kept out of the lazy chunk: it is tiny, and the chunk
 * should only ever load for the admin.
 */
import { Outlet } from 'react-router'
import { Spinner } from '../../components/ui'
import { useAuth } from '../../data/auth'
import { usePlatform } from '../../data/platform'
import { NotFoundScreen } from '../NotFoundScreen'

export function PlatformGate() {
  const ready = useAuth((st) => st.ready)
  const isAdmin = usePlatform((st) => st.isAdmin)
  if (!ready || isAdmin === null) return <Spinner />
  if (!isAdmin) return <NotFoundScreen />
  return <Outlet />
}

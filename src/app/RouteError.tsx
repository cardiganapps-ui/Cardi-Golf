/**
 * The router's error screen. It used to be NotFoundScreen for everything,
 * so a crash while rendering told the person the page did not exist, with no
 * way out. A real 404 still gets NotFound; anything else gets a way to retry
 * or to drop a stale cached app.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { BootProblem } from '../components/BootProblem'

export function RouteError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />
  const message = error instanceof Error ? error.message : String(error)
  if (typeof console !== 'undefined') console.error(error)
  return <BootProblem kind="crash" detail={message} />
}

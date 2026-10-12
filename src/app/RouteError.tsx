/**
 * The router's error screen. It used to be NotFoundScreen for everything,
 * so a crash while rendering told the person the page did not exist, with no
 * way out. A real 404 still gets NotFound; anything else gets a way to retry
 * or to drop a stale cached app.
 */
import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { BootProblem } from '../components/BootProblem'
import { reportError } from '../lib/telemetry'

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  useEffect(() => {
    if (!notFound) reportError('route_error', error)
  }, [error, notFound])
  if (notFound) return <NotFoundScreen />
  // The error itself goes to the console only; the screen says what to do (COPY-04).
  if (typeof console !== 'undefined') console.error(error)
  return <BootProblem kind="crash" />
}

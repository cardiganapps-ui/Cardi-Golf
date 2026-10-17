/**
 * Dev-only routes (ARCH-07): the style guide and the design fixtures, the same
 * screens on in-memory tournaments (src/dev). The router calls `devRoutes` only
 * where DESIGN_ROUTES holds (`npm run dev`, a build with VITE_DESIGN_ROUTES=1:
 * Vercel Preview, the fixture browser suite, design shots); a production build
 * folds that call away, and with it every reference to this module, which does
 * nothing at its top. Their chunks used to ship and be precached on every phone,
 * the fixtures' made-up people with them; a production build that carries any
 * of them now fails (`src/lib/noDevCode.ts`).
 */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import { Lazy } from '../components/Lazy'
import { spectatorChildren } from '../screens/spectator/routes'
import { lazyGroup, lazyScreen } from './lazyScreen'
import { NewTournamentScreen } from './screens'

/**
 * The routes, around the app's own tournament and platform screens. They must come before `t/:slug`. Every
 * lazy screen is made in here, never at the module's top: a top-level `lazy()` is a call the bundler must keep,
 * and it kept each screen's chunk in a production build, which never calls this.
 */
export function devRoutes({
  tournamentChildren,
  platformChildren,
}: {
  tournamentChildren: RouteObject[]
  platformChildren: RouteObject[]
}): RouteObject[] {
  // The fixtures' gates are lazy too, so a fixture build splits as production does (PERF-02).
  const fixtureGate = lazyGroup(() => import('../dev/FixtureGate'))
  const FixtureGate = fixtureGate((m) => m.FixtureGate)
  const FixtureIndex = fixtureGate((m) => m.FixtureIndex)
  const SpectatorFixture = lazyScreen(
    () => import('../dev/SpectatorFixture'),
    (m) => m.SpectatorFixture,
  )
  const ProfileFixture = lazyScreen(
    () => import('../dev/ProfileFixture'),
    (m) => m.ProfileFixture,
  )
  const DesignScreen = lazy(() => import('../design/DesignScreen').then((m) => ({ default: m.DesignScreen })))
  const QuickFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.QuickFixture })))
  const CrewFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.CrewFixture })))
  const RecapFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.RecapFixture })))
  const FriendsFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.FriendsFixture })))
  const InboxFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.InboxFixture })))
  const VersusFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.VersusFixtureScreen })))
  const PlatformFixture = lazy(() => import('../dev/platformFixtures').then((m) => ({ default: m.PlatformFixture })))
  return [
    {
      path: 'fixture',
      element: (
        <Lazy>
          <FixtureIndex />
        </Lazy>
      ),
    },
    {
      path: 'design',
      element: (
        <Lazy>
          <DesignScreen />
        </Lazy>
      ),
    },
    {
      path: 'organizer/nuevo/_',
      element: (
        <Lazy>
          <NewTournamentScreen demo />
        </Lazy>
      ),
    },
    {
      path: 't/_/:name',
      element: (
        <Lazy>
          <FixtureGate />
        </Lazy>
      ),
      children: tournamentChildren,
    },
    {
      path: 'v/_/:name',
      element: (
        <Lazy>
          <SpectatorFixture />
        </Lazy>
      ),
      children: spectatorChildren,
    },
    {
      path: 'v/_dinero/:name',
      element: (
        <Lazy>
          <SpectatorFixture money />
        </Lazy>
      ),
      children: spectatorChildren,
    },
    {
      path: 'p/_/:name',
      element: (
        <Lazy>
          <ProfileFixture />
        </Lazy>
      ),
    },
    {
      path: 'p/_/:name/vs',
      element: (
        <Lazy>
          <VersusFixture />
        </Lazy>
      ),
    },
    {
      path: 'p/_/:name/anio',
      element: (
        <Lazy>
          <RecapFixture />
        </Lazy>
      ),
    },
    {
      path: 'amigos/_',
      element: (
        <Lazy>
          <FriendsFixture />
        </Lazy>
      ),
    },
    {
      path: 'avisos/_',
      element: (
        <Lazy>
          <InboxFixture />
        </Lazy>
      ),
    },
    {
      path: 'ronda/_',
      element: (
        <Lazy>
          <QuickFixture />
        </Lazy>
      ),
    },
    {
      path: 'c/_',
      element: (
        <Lazy>
          <CrewFixture />
        </Lazy>
      ),
    },
    {
      path: 'admin/_',
      element: (
        <Lazy>
          <PlatformFixture />
        </Lazy>
      ),
      children: platformChildren,
    },
  ]
}

/**
 * A link to watch's screens (STRAT-05): the boards only, read-only. No
 * Tarjeta, no Comité, no Más, no Ceremonia, no Reglamento: any other path
 * under it leads nowhere. Shared by the real gate (`/v/<token>`), its design
 * fixtures (`/v/_/<fixture>`) and the tests.
 */
import { lazy } from 'react'
import { Lazy } from '../../components/ui'
import { GamesScreen } from '../tournament/GamesScreen'
import { LiveScreen } from '../tournament/LiveScreen'
import { TournamentShell } from '../tournament/TournamentShell'
import { SpectatorMoney } from './SpectatorGate'

const TvScreen = lazy(() => import('../tournament/TvScreen').then((m) => ({ default: m.TvScreen })))

export const spectatorChildren = [
  {
    element: <TournamentShell />,
    children: [
      { index: true, element: <LiveScreen /> },
      { path: 'juegos', element: <GamesScreen /> },
      { path: 'dinero', element: <SpectatorMoney /> },
    ],
  },
  { path: 'tv', element: <Lazy><TvScreen /></Lazy> },
]

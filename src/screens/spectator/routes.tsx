/**
 * A link to watch's screens (STRAT-05): the boards only, read-only. No
 * Tarjeta, no Comité, no Más, no Ceremonia, no Reglamento: any other path
 * under it leads nowhere. Shared by the real gate (`/v/<token>`), its design
 * fixtures (`/v/_/<fixture>`) and the tests. Each screen is the router's own
 * lazy one (src/app/screens.tsx, PERF-02).
 */
import { Lazy } from '../../components/Lazy'
import { GamesScreen, LiveScreen, SpectatorMoney, TournamentShell, TvScreen } from '../../app/screens'
import { SettingsGuard } from '../tournament/SettingsGuard'

export const spectatorChildren = [
  {
    element: <Lazy><TournamentShell /></Lazy>,
    children: [
      { index: true, element: <Lazy skeleton="board"><LiveScreen /></Lazy> },
      { path: 'juegos', element: <Lazy skeleton="board"><GamesScreen /></Lazy> },
      { path: 'dinero', element: <Lazy><SpectatorMoney /></Lazy> },
    ],
  },
  { path: 'tv', element: <SettingsGuard><Lazy><TvScreen /></Lazy></SettingsGuard> },
]

import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { Lazy } from '../components/Lazy'
import { AppShell } from './AppShell'
import { ContinueScreen } from '../screens/ContinueScreen'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { RouteError } from './RouteError'
import { spectatorChildren } from '../screens/spectator/routes'
import { SettingsGuard } from '../screens/tournament/SettingsGuard'
import { devRoutes } from './devRoutes'
import {
  AdminAuction,
  AdminCourses,
  AdminData,
  AdminDraw,
  AdminGames,
  AdminGroups,
  AdminHandicaps,
  AdminHistory,
  AdminLayout,
  AdminPlayers,
  AdminRounds,
  AdminScores,
  AdminTeams,
  AdminTournament,
  CeremonyScreen,
  CoursesScreen,
  CrewJoinScreen,
  CrewScreen,
  CrewsScreen,
  DemoGate,
  EntrarScreen,
  FriendsScreen,
  GamesScreen,
  HomeScreen,
  InboxScreen,
  LegalScreen,
  LiveScreen,
  MoneyScreen,
  MoreScreen,
  MyTournamentsScreen,
  NewTournamentScreen,
  OAuthReturnScreen,
  OrganizerLoginScreen,
  PlatformAudit,
  PlatformCourse,
  PlatformCourses,
  PlatformCrew,
  PlatformCrews,
  PlatformGate,
  PlatformHealth,
  PlatformLayout,
  PlatformNotices,
  PlatformOverview,
  PlatformPeople,
  PlatformPerson,
  PlatformTournament,
  PlatformTournaments,
  PrintScreen,
  ProfileEditScreen,
  ProfileScreen,
  QuickRoundScreen,
  ResetPasswordScreen,
  RulesScreen,
  ScorecardScreen,
  SpectatorGate,
  StatsScreen,
  TournamentGate,
  TournamentShell,
  TvScreen,
  VersusScreen,
} from './screens'
/** `npm run dev`, or a build with VITE_DESIGN_ROUTES=1 (Vercel Preview, design-shots). */
const DESIGN_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DESIGN_ROUTES === '1'

/** Everything under one tournament; shared by the real gate and the fixtures. */
const tournamentChildren = [
          {
            element: <Lazy><TournamentShell /></Lazy>,
            children: [
              { index: true, element: <Lazy><LiveScreen /></Lazy> },
              { path: 'tarjeta', element: <Lazy><ScorecardScreen /></Lazy> },
              { path: 'juegos', element: <Lazy><GamesScreen /></Lazy> },
              { path: 'dinero', element: <Lazy><MoneyScreen /></Lazy> },
              { path: 'stats', element: <Lazy><StatsScreen /></Lazy> },
              { path: 'reglamento', element: <Lazy><RulesScreen /></Lazy> },
              { path: 'mas', element: <Lazy><MoreScreen /></Lazy> },
            ],
          },
          // Full screens of their own: each computes from the settings, so each waits for a build that reads them (ARCH-04).
          { path: 'tv', element: <SettingsGuard><Lazy><TvScreen /></Lazy></SettingsGuard> },
          { path: 'ceremonia', element: <SettingsGuard money><Lazy><CeremonyScreen /></Lazy></SettingsGuard> },
          { path: 'imprimir', element: <SettingsGuard><Lazy><PrintScreen /></Lazy></SettingsGuard> },
          {
            path: 'admin',
            element: <Lazy><AdminLayout /></Lazy>,
            children: [
              { index: true, element: <Navigate to="torneo" replace /> },
              { path: 'torneo', element: <Lazy><AdminTournament /></Lazy> },
              { path: 'jugadores', element: <Lazy><AdminPlayers /></Lazy> },
              { path: 'campos', element: <Lazy><AdminCourses /></Lazy> },
              { path: 'rondas', element: <Lazy><AdminRounds /></Lazy> },
              { path: 'grupos', element: <Lazy><AdminGroups /></Lazy> },
              { path: 'handicaps', element: <Lazy><AdminHandicaps /></Lazy> },
              { path: 'juegos', element: <Lazy><AdminGames /></Lazy> },
              { path: 'scores', element: <Lazy><AdminScores /></Lazy> },
              { path: 'calcutta', element: <Lazy><AdminAuction /></Lazy> },
              { path: 'parejas', element: <Lazy><AdminDraw /></Lazy> },
              { path: 'equipos', element: <Lazy><AdminTeams /></Lazy> },
              { path: 'historial', element: <Lazy><AdminHistory /></Lazy> },
              { path: 'datos', element: <Lazy><AdminData /></Lazy> },
            ],
          },
]

/** The Admin de Polo panel's sections; shared by the real gate and the fixture. */
const platformChildren = [
  { index: true, element: <Navigate to="resumen" replace /> },
  { path: 'resumen', element: <Lazy><PlatformOverview /></Lazy> },
  {
    path: 'torneos',
    element: <Lazy><PlatformTournaments /></Lazy>,
    children: [{ path: ':id', element: <Lazy><PlatformTournament /></Lazy> }],
  },
  {
    path: 'personas',
    element: <Lazy><PlatformPeople /></Lazy>,
    children: [{ path: ':id', element: <Lazy><PlatformPerson /></Lazy> }],
  },
  {
    path: 'campos',
    element: <Lazy><PlatformCourses /></Lazy>,
    children: [{ path: ':id', element: <Lazy><PlatformCourse /></Lazy> }],
  },
  {
    path: 'crews',
    element: <Lazy><PlatformCrews /></Lazy>,
    children: [{ path: ':id', element: <Lazy><PlatformCrew /></Lazy> }],
  },
  { path: 'avisos', element: <Lazy><PlatformNotices /></Lazy> },
  { path: 'auditoria', element: <Lazy><PlatformAudit /></Lazy> },
  { path: 'salud', element: <Lazy><PlatformHealth /></Lazy> },
]

/**
 * The style guide and the design fixtures (ARCH-07), only where DESIGN_ROUTES holds. A production build folds
 * this to `[]` and drops `devRoutes.tsx` with it, so none of their code ships or is precached.
 */
const DEV_ROUTES: RouteObject[] = DESIGN_ROUTES ? devRoutes({ tournamentChildren, platformChildren }) : []

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Lazy><HomeScreen /></Lazy> },
      // The installed app's shortcuts (PWA-14): the last tournament, on En vivo or its Tarjeta.
      { path: 'continuar', element: <ContinueScreen /> },
      { path: 'continuar/tarjeta', element: <ContinueScreen tab="tarjeta" /> },
      { path: 'organizer/login', element: <Lazy><OrganizerLoginScreen /></Lazy> },
      { path: 'organizer', element: <Lazy><MyTournamentsScreen /></Lazy> },
      { path: 'organizer/new', element: <Lazy><NewTournamentScreen /></Lazy> },
      { path: 'organizer/reset', element: <Lazy><ResetPasswordScreen /></Lazy> },
      { path: 'entrar', element: <Lazy><EntrarScreen /></Lazy> },
      { path: 'privacidad', element: <Lazy><LegalScreen doc="privacy" /></Lazy> },
      { path: 'terminos', element: <Lazy><LegalScreen doc="terms" /></Lazy> },
      { path: 'perfil/vuelta', element: <Lazy><OAuthReturnScreen /></Lazy> },
      { path: 'perfil/editar', element: <Lazy><ProfileEditScreen /></Lazy> },
      { path: 'amigos', element: <Lazy><FriendsScreen /></Lazy> },
      { path: 'avisos', element: <Lazy><InboxScreen /></Lazy> },
      { path: 'ronda', element: <Lazy><QuickRoundScreen /></Lazy> },
      { path: 'campos', element: <Lazy><CoursesScreen /></Lazy> },
      { path: 'crews', element: <Lazy><CrewsScreen /></Lazy> },
      // Dev-only: the style guide and the design fixtures (devRoutes.tsx). In production they exist only on
      // preview builds. Must precede `t/:slug`.
      ...DEV_ROUTES,
      // The Admin de Polo panel: only the platform admin gets past the gate.
      { path: 'admin', element: <Lazy><PlatformGate /></Lazy>, children: [{ element: <Lazy><PlatformLayout /></Lazy>, children: platformChildren }] },
      { path: 't/:slug', element: <Lazy><TournamentGate /></Lazy>, children: tournamentChildren },
      // A link to watch, with no session: the boards, read-only (STRAT-05).
      { path: 'v/:token', element: <Lazy><SpectatorGate /></Lazy>, children: spectatorChildren },
      // The example tournament, on the same read-only screens, with no session (STRAT-17).
      { path: 'demo', element: <Lazy><DemoGate /></Lazy>, children: spectatorChildren },
      { path: 'p/:handle', element: <Lazy><ProfileScreen /></Lazy> },
      { path: 'p/:handle/vs', element: <Lazy><VersusScreen /></Lazy> },
      { path: 'c/unirme/:code', element: <Lazy><CrewJoinScreen /></Lazy> },
      { path: 'c/:slug', element: <Lazy><CrewScreen /></Lazy> },
      // `/tv` with no tournament in it (ARCH-19): the last one this device opened, on its TV; Home with none.
      { path: 'tv', element: <ContinueScreen tab="tv" /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

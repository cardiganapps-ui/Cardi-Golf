import { lazy } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { Lazy } from '../components/ui'
import { t } from '../i18n/es-MX'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { ContinueScreen } from '../screens/ContinueScreen'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { RouteError } from './RouteError'
import { PlatformGate } from '../screens/platform/PlatformGate'
import { OrganizerLoginScreen } from '../screens/organizer/OrganizerLoginScreen'
import { MyTournamentsScreen } from '../screens/organizer/MyTournamentsScreen'
import { NewTournamentScreen } from '../screens/organizer/NewTournamentScreen'
import { ResetPasswordScreen } from '../screens/organizer/ResetPasswordScreen'
import { TournamentGate } from '../screens/tournament/TournamentGate'
import { EntrarScreen } from '../screens/profile/EntrarScreen'
import { OAuthReturnScreen } from '../screens/profile/OAuthReturnScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
const ProfileEditScreen = lazy(() => import('../screens/profile/ProfileEditScreen').then((m) => ({ default: m.ProfileEditScreen })))
const FriendsScreen = lazy(() => import('../screens/profile/FriendsScreen').then((m) => ({ default: m.FriendsScreen })))
const InboxScreen = lazy(() => import('../screens/profile/InboxScreen').then((m) => ({ default: m.InboxScreen })))
const VersusScreen = lazy(() => import('../screens/profile/VersusScreen').then((m) => ({ default: m.VersusScreen })))
const QuickRoundScreen = lazy(() => import('../screens/profile/QuickRoundScreen').then((m) => ({ default: m.QuickRoundScreen })))
const CoursesScreen = lazy(() => import('../screens/profile/CoursesScreen').then((m) => ({ default: m.CoursesScreen })))
const CrewsScreen = lazy(() => import('../screens/profile/CrewsScreen').then((m) => ({ default: m.CrewsScreen })))
const CrewJoinScreen = lazy(() => import('../screens/profile/CrewsScreen').then((m) => ({ default: m.CrewJoinScreen })))
const CrewScreen = lazy(() => import('../screens/profile/CrewScreen').then((m) => ({ default: m.CrewScreen })))
const LegalScreen = lazy(() => import('../screens/LegalScreen').then((m) => ({ default: m.LegalScreen })))
import { SpectatorGate } from '../screens/spectator/SpectatorGate'
import { spectatorChildren } from '../screens/spectator/routes'
import { TournamentShell } from '../screens/tournament/TournamentShell'
import { SettingsGuard } from '../screens/tournament/SettingsGuard'
import { devRoutes } from './devRoutes'
import { LiveScreen } from '../screens/tournament/LiveScreen'
import { ScorecardScreen } from '../screens/tournament/ScorecardScreen'
import { PlaceholderScreen } from '../screens/tournament/PlaceholderScreen'
import { MoreScreen } from '../screens/tournament/MoreScreen'
import { GamesScreen } from '../screens/tournament/GamesScreen'
import { MoneyScreen } from '../screens/tournament/MoneyScreen'
const TvScreen = lazy(() => import('../screens/tournament/TvScreen').then((m) => ({ default: m.TvScreen })))
const StatsScreen = lazy(() => import('../screens/tournament/StatsScreen').then((m) => ({ default: m.StatsScreen })))
import { RulesScreen } from '../screens/tournament/RulesScreen'
const CeremonyScreen = lazy(() => import('../screens/tournament/CeremonyScreen').then((m) => ({ default: m.CeremonyScreen })))
import { AdminLayout } from '../screens/admin/AdminLayout'
const AdminTournament = lazy(() => import('../screens/admin/AdminTournament').then((m) => ({ default: m.AdminTournament })))
const AdminPlayers = lazy(() => import('../screens/admin/AdminPlayers').then((m) => ({ default: m.AdminPlayers })))
const AdminCourses = lazy(() => import('../screens/admin/AdminCourses').then((m) => ({ default: m.AdminCourses })))
const AdminRounds = lazy(() => import('../screens/admin/AdminRounds').then((m) => ({ default: m.AdminRounds })))
const AdminGroups = lazy(() => import('../screens/admin/AdminGroups').then((m) => ({ default: m.AdminGroups })))
const AdminGames = lazy(() => import('../screens/admin/AdminGames').then((m) => ({ default: m.AdminGames })))
const AdminHandicaps = lazy(() => import('../screens/admin/AdminHandicaps').then((m) => ({ default: m.AdminHandicaps })))
const AdminScores = lazy(() => import('../screens/admin/AdminScores').then((m) => ({ default: m.AdminScores })))
const AdminAuction = lazy(() => import('../screens/admin/AdminAuction').then((m) => ({ default: m.AdminAuction })))
const AdminHistory = lazy(() => import('../screens/admin/AdminHistory').then((m) => ({ default: m.AdminHistory })))
const AdminData = lazy(() => import('../screens/admin/AdminData').then((m) => ({ default: m.AdminData })))
const PrintScreen = lazy(() => import('../screens/tournament/PrintScreen').then((m) => ({ default: m.PrintScreen })))
/** `npm run dev`, or a build with VITE_DESIGN_ROUTES=1 (Vercel Preview, design-shots). */
const DESIGN_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DESIGN_ROUTES === '1'
const PlatformLayout = lazy(() => import('../screens/platform').then((m) => ({ default: m.PlatformLayout })))
const PlatformOverview = lazy(() => import('../screens/platform').then((m) => ({ default: m.OverviewScreen })))
const PlatformTournaments = lazy(() => import('../screens/platform').then((m) => ({ default: m.TournamentsScreen })))
const PlatformTournament = lazy(() => import('../screens/platform').then((m) => ({ default: m.TournamentDetail })))
const PlatformPeople = lazy(() => import('../screens/platform').then((m) => ({ default: m.PeopleScreen })))
const PlatformPerson = lazy(() => import('../screens/platform').then((m) => ({ default: m.PersonDetail })))
const PlatformCourses = lazy(() => import('../screens/platform').then((m) => ({ default: m.CatalogCourses })))
const PlatformCourse = lazy(() => import('../screens/platform').then((m) => ({ default: m.CourseDetail })))
const PlatformCrews = lazy(() => import('../screens/platform').then((m) => ({ default: m.CatalogCrews })))
const PlatformCrew = lazy(() => import('../screens/platform').then((m) => ({ default: m.CrewDetail })))
const PlatformNotices = lazy(() => import('../screens/platform').then((m) => ({ default: m.NoticesScreen })))
const PlatformAudit = lazy(() => import('../screens/platform').then((m) => ({ default: m.AuditScreen })))
const PlatformHealth = lazy(() => import('../screens/platform').then((m) => ({ default: m.HealthScreen })))
const AdminDraw = lazy(() => import('../screens/admin/AdminDraw').then((m) => ({ default: m.AdminDraw })))
const AdminTeams = lazy(() => import('../screens/admin/AdminTeams').then((m) => ({ default: m.AdminTeams })))

/** Everything under one tournament; shared by the real gate and the fixtures. */
const tournamentChildren = [
          {
            element: <TournamentShell />,
            children: [
              { index: true, element: <LiveScreen /> },
              { path: 'tarjeta', element: <ScorecardScreen /> },
              { path: 'juegos', element: <GamesScreen /> },
              { path: 'dinero', element: <MoneyScreen /> },
              { path: 'stats', element: <Lazy><StatsScreen /></Lazy> },
              { path: 'reglamento', element: <RulesScreen /> },
              { path: 'mas', element: <MoreScreen /> },
            ],
          },
          // Full screens of their own: each computes from the settings, so each waits for a build that reads them (ARCH-04).
          { path: 'tv', element: <SettingsGuard><Lazy><TvScreen /></Lazy></SettingsGuard> },
          { path: 'ceremonia', element: <SettingsGuard money><Lazy><CeremonyScreen /></Lazy></SettingsGuard> },
          { path: 'imprimir', element: <SettingsGuard><Lazy><PrintScreen /></Lazy></SettingsGuard> },
          {
            path: 'admin',
            element: <AdminLayout />,
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
      { index: true, element: <HomeScreen /> },
      // The installed app's shortcuts (PWA-14): the last tournament, on En vivo or its Tarjeta.
      { path: 'continuar', element: <ContinueScreen /> },
      { path: 'continuar/tarjeta', element: <ContinueScreen tab="tarjeta" /> },
      { path: 'organizer/login', element: <OrganizerLoginScreen /> },
      { path: 'organizer', element: <MyTournamentsScreen /> },
      { path: 'organizer/new', element: <NewTournamentScreen /> },
      { path: 'organizer/reset', element: <ResetPasswordScreen /> },
      { path: 'entrar', element: <EntrarScreen /> },
      { path: 'privacidad', element: <Lazy><LegalScreen doc="privacy" /></Lazy> },
      { path: 'terminos', element: <Lazy><LegalScreen doc="terms" /></Lazy> },
      { path: 'perfil/vuelta', element: <OAuthReturnScreen /> },
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
      { path: 'admin', element: <PlatformGate />, children: [{ element: <Lazy><PlatformLayout /></Lazy>, children: platformChildren }] },
      { path: 't/:slug', element: <TournamentGate />, children: tournamentChildren },
      // A link to watch, with no session: the boards, read-only (STRAT-05).
      { path: 'v/:token', element: <SpectatorGate />, children: spectatorChildren },
      { path: 'p/:handle', element: <ProfileScreen /> },
      { path: 'p/:handle/vs', element: <Lazy><VersusScreen /></Lazy> },
      { path: 'c/unirme/:code', element: <Lazy><CrewJoinScreen /></Lazy> },
      { path: 'c/:slug', element: <Lazy><CrewScreen /></Lazy> },
      { path: 'tv', element: <PlaceholderScreen title={t.tv.title} /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

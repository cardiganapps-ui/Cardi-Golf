import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Lazy } from '../components/ui'
import { t } from '../i18n/es-MX'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
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
import { ProfileFixture, ProfileScreen } from '../screens/profile/ProfileScreen'
const ProfileEditScreen = lazy(() => import('../screens/profile/ProfileEditScreen').then((m) => ({ default: m.ProfileEditScreen })))
const FriendsScreen = lazy(() => import('../screens/profile/FriendsScreen').then((m) => ({ default: m.FriendsScreen })))
const InboxScreen = lazy(() => import('../screens/profile/InboxScreen').then((m) => ({ default: m.InboxScreen })))
const VersusScreen = lazy(() => import('../screens/profile/VersusScreen').then((m) => ({ default: m.VersusScreen })))
const QuickRoundScreen = lazy(() => import('../screens/profile/QuickRoundScreen').then((m) => ({ default: m.QuickRoundScreen })))
const CoursesScreen = lazy(() => import('../screens/profile/CoursesScreen').then((m) => ({ default: m.CoursesScreen })))
const QuickFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.QuickFixture })))
const CrewsScreen = lazy(() => import('../screens/profile/CrewsScreen').then((m) => ({ default: m.CrewsScreen })))
const CrewJoinScreen = lazy(() => import('../screens/profile/CrewsScreen').then((m) => ({ default: m.CrewJoinScreen })))
const CrewScreen = lazy(() => import('../screens/profile/CrewScreen').then((m) => ({ default: m.CrewScreen })))
const CrewFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.CrewFixture })))
const RecapFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.RecapFixture })))
const LegalScreen = lazy(() => import('../screens/LegalScreen').then((m) => ({ default: m.LegalScreen })))
const FriendsFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.FriendsFixture })))
const InboxFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.InboxFixture })))
const VersusFixture = lazy(() => import('../dev/socialFixtures').then((m) => ({ default: m.VersusFixtureScreen })))
import { FixtureGate, FixtureIndex } from '../dev/FixtureGate'
import { TournamentShell } from '../screens/tournament/TournamentShell'
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
const AdminData = lazy(() => import('../screens/admin/AdminData').then((m) => ({ default: m.AdminData })))
const PrintScreen = lazy(() => import('../screens/tournament/PrintScreen').then((m) => ({ default: m.PrintScreen })))
/** `npm run dev`, or a build with VITE_DESIGN_ROUTES=1 (Vercel Preview, design-shots). */
const DESIGN_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DESIGN_ROUTES === '1'
const DesignScreen = lazy(() => import('../design/DesignScreen').then((m) => ({ default: m.DesignScreen })))
const PlatformLayout = lazy(() => import('../screens/platform').then((m) => ({ default: m.PlatformLayout })))
const PlatformOverview = lazy(() => import('../screens/platform').then((m) => ({ default: m.OverviewScreen })))
const PlatformTournaments = lazy(() => import('../screens/platform').then((m) => ({ default: m.TournamentsScreen })))
const PlatformTournament = lazy(() => import('../screens/platform').then((m) => ({ default: m.TournamentDetail })))
const PlatformSoon = lazy(() => import('../screens/platform').then((m) => ({ default: m.SoonScreen })))
const PlatformFixture = lazy(() => import('../dev/platformFixtures').then((m) => ({ default: m.PlatformFixture })))
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
          { path: 'tv', element: <Lazy><TvScreen /></Lazy> },
          { path: 'ceremonia', element: <Lazy><CeremonyScreen /></Lazy> },
          { path: 'imprimir', element: <Lazy><PrintScreen /></Lazy> },
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
              { path: 'datos', element: <Lazy><AdminData /></Lazy> },
            ],
          },
]

/** The Admin de Polo panel's sections; shared by the real gate and the fixture. */
const P = t.platform.sections
const platformChildren = [
  { index: true, element: <Navigate to="resumen" replace /> },
  { path: 'resumen', element: <Lazy><PlatformOverview /></Lazy> },
  {
    path: 'torneos',
    element: <Lazy><PlatformTournaments /></Lazy>,
    children: [{ path: ':id', element: <Lazy><PlatformTournament /></Lazy> }],
  },
  { path: 'personas', element: <Lazy><PlatformSoon title={P.people} /></Lazy> },
  { path: 'campos', element: <Lazy><PlatformSoon title={P.courses} /></Lazy> },
  { path: 'crews', element: <Lazy><PlatformSoon title={P.crews} /></Lazy> },
  { path: 'avisos', element: <Lazy><PlatformSoon title={P.notices} /></Lazy> },
  { path: 'auditoria', element: <Lazy><PlatformSoon title={P.audit} /></Lazy> },
  { path: 'salud', element: <Lazy><PlatformSoon title={P.health} /></Lazy> },
]

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomeScreen /> },
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
      // Dev-only: the style guide and the design fixtures (the same screens on in-memory
      // tournaments, src/dev). In production they exist only on preview builds. Must precede `t/:slug`.
      ...(DESIGN_ROUTES
        ? [
            { path: 'fixture', element: <FixtureIndex /> },
            { path: 'design', element: <Lazy><DesignScreen /></Lazy> },
            { path: 'organizer/nuevo/_', element: <NewTournamentScreen demo /> },
            { path: 't/_/:name', element: <FixtureGate />, children: tournamentChildren },
            { path: 'p/_/:name', element: <ProfileFixture /> },
            { path: 'p/_/:name/vs', element: <Lazy><VersusFixture /></Lazy> },
            { path: 'p/_/:name/anio', element: <Lazy><RecapFixture /></Lazy> },
            { path: 'amigos/_', element: <Lazy><FriendsFixture /></Lazy> },
            { path: 'avisos/_', element: <Lazy><InboxFixture /></Lazy> },
            { path: 'ronda/_', element: <Lazy><QuickFixture /></Lazy> },
            { path: 'c/_', element: <Lazy><CrewFixture /></Lazy> },
            { path: 'admin/_', element: <Lazy><PlatformFixture /></Lazy>, children: platformChildren },
          ]
        : []),
      // The Admin de Polo panel: only the platform admin gets past the gate.
      { path: 'admin', element: <PlatformGate />, children: [{ element: <Lazy><PlatformLayout /></Lazy>, children: platformChildren }] },
      { path: 't/:slug', element: <TournamentGate />, children: tournamentChildren },
      { path: 'p/:handle', element: <ProfileScreen /> },
      { path: 'p/:handle/vs', element: <Lazy><VersusScreen /></Lazy> },
      { path: 'c/unirme/:code', element: <Lazy><CrewJoinScreen /></Lazy> },
      { path: 'c/:slug', element: <Lazy><CrewScreen /></Lazy> },
      { path: 'tv', element: <PlaceholderScreen title={t.tv.title} /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

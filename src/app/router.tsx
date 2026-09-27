import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Lazy } from '../components/ui'
import { t } from '../i18n/es-MX'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { OrganizerLoginScreen } from '../screens/organizer/OrganizerLoginScreen'
import { MyTournamentsScreen } from '../screens/organizer/MyTournamentsScreen'
import { NewTournamentScreen } from '../screens/organizer/NewTournamentScreen'
import { ResetPasswordScreen } from '../screens/organizer/ResetPasswordScreen'
import { TournamentGate } from '../screens/tournament/TournamentGate'
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
const AdminHandicaps = lazy(() => import('../screens/admin/AdminHandicaps').then((m) => ({ default: m.AdminHandicaps })))
const AdminScores = lazy(() => import('../screens/admin/AdminScores').then((m) => ({ default: m.AdminScores })))
const AdminAuction = lazy(() => import('../screens/admin/AdminAuction').then((m) => ({ default: m.AdminAuction })))
const AdminData = lazy(() => import('../screens/admin/AdminData').then((m) => ({ default: m.AdminData })))
const PrintScreen = lazy(() => import('../screens/tournament/PrintScreen').then((m) => ({ default: m.PrintScreen })))
const DesignScreen = lazy(() => import('../design/DesignScreen').then((m) => ({ default: m.DesignScreen })))
const AdminDraw = lazy(() => import('../screens/admin/AdminDraw').then((m) => ({ default: m.AdminDraw })))

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
              { path: 'scores', element: <Lazy><AdminScores /></Lazy> },
              { path: 'calcutta', element: <Lazy><AdminAuction /></Lazy> },
              { path: 'parejas', element: <Lazy><AdminDraw /></Lazy> },
              { path: 'datos', element: <Lazy><AdminData /></Lazy> },
            ],
          },
]

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundScreen />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'organizer/login', element: <OrganizerLoginScreen /> },
      { path: 'organizer', element: <MyTournamentsScreen /> },
      { path: 'organizer/new', element: <NewTournamentScreen /> },
      { path: 'organizer/reset', element: <ResetPasswordScreen /> },
      { path: 'fixture', element: <FixtureIndex /> },
      { path: 'design', element: <Lazy><DesignScreen /></Lazy> },
      // Design fixtures: the same screens on in-memory tournaments (src/dev). Must precede `t/:slug`.
      { path: 't/_/:name', element: <FixtureGate />, children: tournamentChildren },
      { path: 't/:slug', element: <TournamentGate />, children: tournamentChildren },
      { path: 'tv', element: <PlaceholderScreen title={t.tv.title} /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

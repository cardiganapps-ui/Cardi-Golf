import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { OrganizerLoginScreen } from '../screens/organizer/OrganizerLoginScreen'
import { MyTournamentsScreen } from '../screens/organizer/MyTournamentsScreen'
import { NewTournamentScreen } from '../screens/organizer/NewTournamentScreen'
import { ResetPasswordScreen } from '../screens/organizer/ResetPasswordScreen'
import { TournamentGate } from '../screens/tournament/TournamentGate'
import { TournamentShell } from '../screens/tournament/TournamentShell'
import { LiveScreen } from '../screens/tournament/LiveScreen'
import { ScorecardScreen } from '../screens/tournament/ScorecardScreen'
import { PlaceholderScreen } from '../screens/tournament/PlaceholderScreen'
import { MoreScreen } from '../screens/tournament/MoreScreen'
import { GamesScreen } from '../screens/tournament/GamesScreen'
import { MoneyScreen } from '../screens/tournament/MoneyScreen'
import { TvScreen } from '../screens/tournament/TvScreen'
import { AdminLayout } from '../screens/admin/AdminLayout'
import { AdminTournament } from '../screens/admin/AdminTournament'
import { AdminPlayers } from '../screens/admin/AdminPlayers'
import { AdminCourses } from '../screens/admin/AdminCourses'
import { AdminRounds } from '../screens/admin/AdminRounds'
import { AdminGroups } from '../screens/admin/AdminGroups'
import { AdminHandicaps } from '../screens/admin/AdminHandicaps'
import { AdminScores } from '../screens/admin/AdminScores'
import { AdminAuction } from '../screens/admin/AdminAuction'
import { AdminDraw } from '../screens/admin/AdminDraw'

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
      {
        path: 't/:slug',
        element: <TournamentGate />,
        children: [
          {
            element: <TournamentShell />,
            children: [
              { index: true, element: <LiveScreen /> },
              { path: 'tarjeta', element: <ScorecardScreen /> },
              { path: 'juegos', element: <GamesScreen /> },
              { path: 'dinero', element: <MoneyScreen /> },
              { path: 'mas', element: <MoreScreen /> },
            ],
          },
          { path: 'tv', element: <TvScreen /> },
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="torneo" replace /> },
              { path: 'torneo', element: <AdminTournament /> },
              { path: 'jugadores', element: <AdminPlayers /> },
              { path: 'campos', element: <AdminCourses /> },
              { path: 'rondas', element: <AdminRounds /> },
              { path: 'grupos', element: <AdminGroups /> },
              { path: 'handicaps', element: <AdminHandicaps /> },
              { path: 'scores', element: <AdminScores /> },
              { path: 'calcutta', element: <AdminAuction /> },
              { path: 'parejas', element: <AdminDraw /> },
            ],
          },
        ],
      },
      { path: 'tv', element: <PlaceholderScreen title="Modo TV" /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

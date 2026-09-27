import { createBrowserRouter } from 'react-router'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { NotFoundScreen } from '../screens/NotFoundScreen'
import { TournamentPlaceholder } from '../screens/TournamentPlaceholder'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundScreen />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 't/:slug/*', element: <TournamentPlaceholder /> },
      { path: 'tv', element: <TournamentPlaceholder mode="tv" /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])

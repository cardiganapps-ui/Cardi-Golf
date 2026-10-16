import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import { router } from './app/router'
import { RootBoundary } from './app/RootBoundary'
import { offerUpdate, startUpdateChecks } from './data/appUpdate'
import { setTelemetryTournament, startTelemetry, step } from './lib/telemetry'
import { startChunkRecovery } from './lib/chunkReload'
import { listenForInstall } from './lib/install'
import { listenForNoticeTaps } from './lib/noticeTaps'
import { startBadgeSync } from './data/push'
import { useTournament } from './data/tournamentStore'
import { launchesIntoTournament } from './lib/launch'
import { TournamentGate } from './app/screens'

// A screen from the build before a deploy loads the new build instead of failing (REL-13).
startChunkRecovery()
// Android's install offer comes once and early: kept for the «Instalar» button (PWA-08).
listenForInstall()
// A tap on a notice goes to its page through the router, never a reload over a half-entered hole (PWA-12).
listenForNoticeTaps((path) => void router.navigate(path))
// The icon's count follows the inbox, read again each time the app comes back (PWA-12).
startBadgeSync()

// A new deploy is offered by a bar that stays until it is applied, never
// applied on its own: an automatic reload would throw away a half-entered
// hole on the course. The bar waits while the Tarjeta has an unsaved hole.
const updateSW = registerSW({
  onNeedRefresh() {
    offerUpdate(() => updateSW(true))
  },
  onRegisteredSW(_url, registration) {
    startUpdateChecks(registration ?? null)
  },
})
// minBuild and the flag checks start now; the service worker joins when it registers (never in dev).
startUpdateChecks(null)

// First-party telemetry (STRAT-02): errors, sync times, vitals, a few steps, a heartbeat. Production only.
startTelemetry()
useTournament.subscribe((s, prev) => {
  if (s.tournamentId === prev.tournamentId) return
  setTelemetryTournament(s.tournamentId)
  if (s.tournamentId) step('tournament_open', { once: true })
})

// An open that goes on into a tournament (its link, a shortcut, the installed app going back to it) starts on the
// tournament's screens now: Home's chunk and theirs load side by side, not one after the other (PERF-02).
if (launchesIntoTournament(location.pathname, location.search)) void TournamentGate.preload().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Motion's reduce-motion setting is the tournament gates' (src/design/MotionScope.tsx): nothing else animates. */}
    <RootBoundary>
      <RouterProvider router={router} />
    </RootBoundary>
  </StrictMode>,
)

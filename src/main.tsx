import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { MotionConfig } from 'motion/react'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import { router } from './app/router'
import { RootBoundary } from './app/RootBoundary'
import { offerUpdate, startUpdateChecks } from './data/appUpdate'
import { setTelemetryTournament, startTelemetry, step } from './lib/telemetry'
import { useTournament } from './data/tournamentStore'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Every Motion animation honours the system's reduce-motion setting. */}
    <MotionConfig reducedMotion="user">
      <RootBoundary>
        <RouterProvider router={router} />
      </RootBoundary>
    </MotionConfig>
  </StrictMode>,
)

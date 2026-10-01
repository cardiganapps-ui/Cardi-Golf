import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { MotionConfig } from 'motion/react'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import { router } from './app/router'
import { RootBoundary } from './app/RootBoundary'
import { offerUpdate, startUpdateChecks } from './data/appUpdate'

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

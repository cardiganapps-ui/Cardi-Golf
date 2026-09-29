import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { MotionConfig } from 'motion/react'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import { router } from './app/router'
import { RootBoundary } from './app/RootBoundary'
import { toast } from './components/ui'
import { useOutbox } from './data/outbox'
import { t } from './i18n/es-MX'

// A new deploy is offered with a toast, never applied on its own: an
// automatic reload would throw away a half-entered hole on the course.
// While the Tarjeta has an unsaved hole the offer waits for the save.
const updateSW = registerSW({
  onNeedRefresh() {
    const offer = () => toast(t.sync.newVersion, { label: t.sync.update, onClick: () => void updateSW(true) })
    if (!useOutbox.getState().editing) return offer()
    const unsub = useOutbox.subscribe((s) => {
      if (!s.editing) {
        unsub()
        offer()
      }
    })
  },
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

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import { router } from './app/router'

// Auto-update service worker: a new deploy is picked up on the next open.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

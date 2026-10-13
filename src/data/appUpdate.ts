/**
 * Keeping every phone on the same build (PWA-03). Each client computes
 * standings and money itself, so a fix only counts once the phones run it.
 *
 * - A deploy is noticed while the app stays open: the service worker is
 *   re-checked when the app comes back to the front and every 30 minutes.
 * - A waiting update is offered by a bar that stays until it is applied
 *   (never a toast that vanishes, never over «Guardar hoyo»), and waits
 *   while the Tarjeta has a half-entered hole.
 * - `app_flags.minBuild` can require this build or newer: below it, the
 *   outbox holds every write on the phone and the bar insists. Checked at
 *   start, on resume and every 10 minutes.
 */
import { create } from 'zustand'
import { belowMinBuild } from '../lib/build'
import { setOutboxBlocked } from './outbox'
import { useAppFlags } from './platform'

export const SW_CHECK_MS = 30 * 60 * 1000
export const FLAGS_CHECK_MS = 10 * 60 * 1000

interface AppUpdateState {
  /** A new version is installed and waiting; `apply` reloads into it. */
  waiting: boolean
  /** This build is below `app_flags.minBuild`. */
  required: boolean
  applyWaiting: (() => Promise<void>) | null
}
export const useAppUpdate = create<AppUpdateState>(() => ({ waiting: false, required: false, applyWaiting: null }))

/** The service worker has a new version waiting (vite-plugin-pwa's onNeedRefresh). */
export function offerUpdate(apply: () => Promise<void>) {
  useAppUpdate.setState({ waiting: true, applyWaiting: apply })
}

let registration: ServiceWorkerRegistration | null = null
/** Ask the server for a newer service worker; a waiting one triggers `offerUpdate`. */
export async function checkForUpdate() {
  try {
    await registration?.update()
  } catch {
    // Offline or the server is down: the next check tries again.
  }
}

let reloadPage = () => window.location.reload()

/**
 * vite-plugin-pwa reloads once the new worker takes the page, but only on a page that had a worker when it
 * loaded. On a first visit (no worker yet, then this build's took the page) the new worker took it and nothing
 * reloaded: the bar stayed, and a second tap had no waiting worker left to tell (QA-16). The page reloads
 * itself when its worker changes.
 */
function reloadOnNewWorker() {
  navigator.serviceWorker?.addEventListener('controllerchange', () => reloadPage(), { once: true })
}

/** Apply the update: the waiting worker if there is one, else look for it, else a plain reload. */
export async function applyUpdate() {
  const { applyWaiting } = useAppUpdate.getState()
  if (applyWaiting) {
    // Nothing waiting any more (another tab of the app took the update): this page has the new worker already.
    if (registration && !registration.waiting) return reloadPage()
    reloadOnNewWorker()
    return applyWaiting()
  }
  await checkForUpdate()
  const now = useAppUpdate.getState().applyWaiting
  if (now) {
    reloadOnNewWorker()
    return now()
  }
  reloadPage()
}

function evaluate(minBuild: unknown) {
  const required = belowMinBuild(minBuild)
  useAppUpdate.setState({ required })
  setOutboxBlocked(required)
  if (required) void checkForUpdate()
}

let started = false
/** Call once at start, with the service worker registration when there is one. */
export function startUpdateChecks(reg: ServiceWorkerRegistration | null) {
  if (reg) registration = reg
  if (started) return
  started = true
  evaluate(useAppFlags.getState().flags?.minBuild)
  useAppFlags.subscribe((s) => evaluate(s.flags?.minBuild))
  setInterval(() => void checkForUpdate(), SW_CHECK_MS)
  setInterval(() => void useAppFlags.getState().load(), FLAGS_CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void checkForUpdate()
    void useAppFlags.getState().load()
  })
}

/** For tests. */
export const _appUpdateTest = {
  reset() {
    started = false
    registration = null
    reloadPage = () => window.location.reload()
    useAppUpdate.setState({ waiting: false, required: false, applyWaiting: null })
  },
  /** What a reload does here. */
  setReload(fn: () => void) {
    reloadPage = fn
  },
}

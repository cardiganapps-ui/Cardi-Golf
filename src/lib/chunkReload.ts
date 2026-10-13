/**
 * A deploy replaced the screens this page was built with (REL-13). A page the
 * service worker does not control (a first visit, WhatsApp's in-app browser)
 * asks the server for its own build's chunk, which is gone: opening
 * Estadísticas, the TV or any Comité screen after a deploy landed on «Algo
 * falló al abrir Polo» until someone pressed «Reiniciar la app».
 *
 * Now the page loads the new build instead, once. A second failure within a
 * minute is something else (the signal) and shows as before. Offline it never
 * reloads: without a service worker the reload would lose the app altogether.
 * A half-entered hole survives the reload (PWA-05), and so does the outbox.
 */
const KEY = 'cardi-golf:chunk-reload'
const WINDOW_MS = 60_000
let reloading = false

/** True once the page has decided to load the new build: the error screen stays blank meanwhile. */
export function reloadingForNewBuild(): boolean {
  return reloading
}

/** Vite fires `vite:preloadError` when a screen's chunk (or its stylesheet) fails to load. */
export function startChunkRecovery(win: Window = window): void {
  win.addEventListener('vite:preloadError', () => {
    if (reloading || win.navigator.onLine === false) return
    const now = Date.now()
    try {
      // Within a minute of the last reload, or with the clock set back since: let the error show.
      if (now - (Number(win.sessionStorage.getItem(KEY)) || 0) < WINDOW_MS) return
      win.sessionStorage.setItem(KEY, String(now))
    } catch {
      // Nothing to remember the reload by: a second one could loop.
      return
    }
    reloading = true
    win.location.reload()
  })
}

/** For tests. */
export function resetChunkRecoveryForTests() {
  reloading = false
}

/**
 * A tap on a notice while the app is open (PWA-12). The service worker
 * (public/push-sw.js) asks the page to open the notice's page, and the app's
 * own router goes there: nothing reloads, so a hole half entered on the
 * Tarjeta stays as it was (kept on the phone, PWA-05) and the boards keep
 * their live channel. It used to be a full navigation from the worker, which
 * reloaded the app and was refused for a page the worker didn't control.
 *
 * The page answers on the message's port; a page that doesn't (an older
 * build) is moved by the worker the old way.
 */

/** A page of this app, as its router takes it (path, query, hash), or null for anything else. */
export function inAppPath(url: unknown, origin: string): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url, origin)
    return u.origin === origin ? `${u.pathname}${u.search}${u.hash}` : null
  } catch {
    return null
  }
}

/** Starts listening; `go` is the router's navigate. Returns the undo. */
export function listenForNoticeTaps(go: (path: string) => void): () => void {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
  if (!sw) return () => undefined
  const onMessage = (e: MessageEvent) => {
    const msg = e.data as { type?: unknown; url?: unknown } | null
    if (msg?.type !== 'navigate') return
    const path = inAppPath(msg.url, window.location.origin)
    if (path != null && `${window.location.pathname}${window.location.search}${window.location.hash}` !== path) go(path)
    e.ports[0]?.postMessage({ ok: path != null })
  }
  sw.addEventListener('message', onMessage)
  return () => sw.removeEventListener('message', onMessage)
}

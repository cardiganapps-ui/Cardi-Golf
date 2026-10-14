/**
 * A link to watch (`/v/<token>`, its design fixtures `/v/_/<name>` and
 * `/v/_dinero/<name>`; STRAT-05) is nobody's phone: often a TV or a screen
 * passed around. The app keeps and sends nothing of its own there: no session
 * read, no outbox (its IndexedDB is never opened), no telemetry (no device id,
 * no queued event), no install card, no profile or inbox. The service worker
 * still caches the app and its icons, as for any page of Polo.
 */
export const isLinkPage = (path: string): boolean => /^\/v\//.test(path)

/** The page on screen is a link to watch. */
export const onLinkPage = (): boolean => typeof location !== 'undefined' && isLinkPage(location.pathname)

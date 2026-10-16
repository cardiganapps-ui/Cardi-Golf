/**
 * A link to watch (`/v/<token>`, its design fixtures `/v/_/<name>` and
 * `/v/_dinero/<name>`; STRAT-05) is nobody's phone: often a TV or a screen
 * passed around. The app keeps and sends nothing of its own there: no session
 * read, no outbox (its IndexedDB is never opened), no telemetry (no device id,
 * no queued event), no install card, no profile or inbox, and its requests go
 * as anon with no session (`src/data/anonRpc.ts`). The service worker still
 * caches the app and its icons, as for any page of Polo. The example
 * tournament (`/demo`, STRAT-17) is one too: nobody's phone, nothing kept, and
 * no tournament to count.
 */
import { matchRoutes } from 'react-router'

/**
 * The router's own matching, so whatever address opens a link page counts as one: it matches without regard to
 * case (`/V/<token>`), with a trailing slash, and on the decoded path (`/%76/<token>`). A check of its own read
 * `/V/…` as no link, and the page started the outbox and telemetry, whose route carried the token.
 */
const LINK_ROUTES = [{ path: '/v/:token/*' }, { path: '/demo/*' }]
export const isLinkPage = (path: string): boolean => !!matchRoutes(LINK_ROUTES, path)

/** The page on screen is a link to watch. */
export const onLinkPage = (): boolean => typeof location !== 'undefined' && isLinkPage(location.pathname)

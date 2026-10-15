/** LegalUpdate's route rule and what it already asked, apart from the component (fast refresh). */

/**
 * Where a sheet must not appear: entering a hole, Calcutta night's consoles (auction, pairs draw), a screen for the
 * room, a new password, the documents themselves, the in-memory fixtures, and a link to watch (STRAT-05: often a TV or
 * a shared screen, never where someone's own account is the matter).
 */
export const QUIET_ROUTE = /^\/(privacidad|terminos)(\/|$)|^\/t\/_\/|^\/v\/|^\/admin\/_|^\/organizer\/reset(\/|$)|\/(tarjeta|tv|ceremonia|imprimir)(\/|$)|\/admin\/(calcutta|parejas)(\/|$)/

/** How long after a session change the shell asks: the sign-in records its own acceptance first. */
export const SETTLE_MS = 2_500

export type Changed = { privacy: boolean; terms: boolean; first?: boolean }

/**
 * Asked once per user per app load (an anonymous phone that becomes an
 * account in place is the same user, asked again: `key` carries both);
 * «Cerrar» lasts until the app opens again.
 */
export const legalAsked: { asked: { key: string; changed: Changed | null } | null; dismissed: string | null } = { asked: null, dismissed: null }

export function resetLegalUpdateForTests() {
  legalAsked.asked = null
  legalAsked.dismissed = null
}

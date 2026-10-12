/** LegalUpdate's route rule and what it already asked, apart from the component (fast refresh). */

/** Where a sheet must not appear: entering a hole, the auction console, a screen for the room, the documents themselves, the in-memory fixtures. */
export const QUIET_ROUTE = /^\/(privacidad|terminos)(\/|$)|^\/t\/_\/|^\/admin\/_|\/(tarjeta|tv|ceremonia|imprimir)(\/|$)|\/admin\/calcutta(\/|$)/

/** How long after a session change the shell asks: the sign-in records its own acceptance first. */
export const SETTLE_MS = 2_500

export type Changed = { privacy: boolean; terms: boolean; first?: boolean }

/** Asked once per user per app load; «Cerrar» lasts until the app opens again. */
export const legalAsked: { asked: { uid: string; changed: Changed | null } | null; dismissed: string | null } = { asked: null, dismissed: null }

export function resetLegalUpdateForTests() {
  legalAsked.asked = null
  legalAsked.dismissed = null
}

/** LegalUpdate's route rule and what it already asked, apart from the component (fast refresh). */

/** Where a sheet must not appear: entering a hole, a screen for the room, the documents themselves, the fixtures. */
export const QUIET_ROUTE = /^\/(privacidad|terminos)(\/|$)|^\/t\/_\/|^\/admin\/_|\/(tarjeta|tv|ceremonia|imprimir)(\/|$)/

export type Changed = { privacy: boolean; terms: boolean }

/** Asked once per user per app load; «Cerrar» lasts until the app opens again. */
export const legalAsked: { asked: { uid: string; changed: Changed | null } | null; dismissed: string | null } = { asked: null, dismissed: null }

export function resetLegalUpdateForTests() {
  legalAsked.asked = null
  legalAsked.dismissed = null
}

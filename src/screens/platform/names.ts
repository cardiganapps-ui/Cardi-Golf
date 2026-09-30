import { t } from '../../i18n/es-MX'
import type { PersonRow } from '../../data/platform'

/** How a person is named: profile, else email, else the player a phone claimed. */
export function personName(r: Pick<PersonRow, 'displayName' | 'email' | 'devicePlayer'>): string {
  return r.displayName ?? r.email ?? r.devicePlayer ?? t.platform.people.phone
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

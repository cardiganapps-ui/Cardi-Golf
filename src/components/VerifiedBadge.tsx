/**
 * «Tarjeta verificada» (0075, STRAT-14): a person compared the course's card with the club's printed one, the Admin
 * de Polo or the Comité of a tournament that played it unchanged. Any later change to the card takes it off on the
 * server. Unverified cards are still usable, so their absence says nothing.
 */
import { t } from '../i18n/es-MX'
import { IconCheck } from './icons'
import s from './VerifiedBadge.module.css'

export function VerifiedBadge() {
  return (
    <span className={`chip chip--teal ${s.badge}`}>
      <IconCheck size={14} />
      {t.courses.verified}
    </span>
  )
}

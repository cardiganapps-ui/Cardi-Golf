/** Footer links to the privacy notice and the terms (required on the home page for Google sign-in). */
import { Link } from 'react-router'
import { t } from '../i18n/es-MX'

export function LegalLinks() {
  return (
    <nav aria-label={t.legal.privacy.title} style={{ display: 'flex', gap: 'var(--s4)', fontSize: 'var(--fs-xs)', paddingBottom: 'var(--s4)' }}>
      <Link to="/privacidad" style={{ color: 'var(--ink-2)' }}>
        {t.legal.privacy.title}
      </Link>
      <Link to="/terminos" style={{ color: 'var(--ink-2)' }}>
        {t.legal.terms.title}
      </Link>
    </nav>
  )
}

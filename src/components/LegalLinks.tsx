/** Links to the privacy notice and the terms: a footer on home, and a consent line where data is collected. */
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

/** A legal page opened beside the form, so a half-typed email, code or PIN survives the read. */
function LegalLink({ to, children }: { to: '/privacidad' | '/terminos'; children: string }) {
  return (
    <a href={to} target="_blank" rel="noopener" style={{ color: 'var(--ink-2)' }}>
      {children}
      <span className="sr-only"> {t.legal.newTab}</span>
    </a>
  )
}

const lineStyle = { fontSize: 'var(--fs-xs)', color: 'var(--ink-2)', lineHeight: 'var(--lh-body)' } as const

/**
 * «Al continuar aceptas los Términos de uso y el Aviso de privacidad.» Where
 * someone is about to give their data (an account, a PIN on a tournament's
 * faces, a quick round with friends), the notice is one tap away first
 * (TRUST-05). `enter`: the short «Al entrar aceptas los Términos…» that fits
 * above a tournament's faces. `id`: for the field that takes focus below it,
 * so a screen reader hears the line with the field (`aria-describedby`).
 */
export function LegalConsent({ enter = false, id }: { enter?: boolean; id?: string }) {
  const C = t.legal.consent
  return (
    <p id={id} data-legal-consent style={lineStyle}>
      {enter ? C.enterStart : C.start}
      <LegalLink to="/terminos">{enter ? C.termsShort : C.terms}</LegalLink>
      {C.middle}
      <LegalLink to="/privacidad">{C.privacy}</LegalLink>
      {C.end}
    </p>
  )
}

/** Where the Comité types other people's data: what happens to it. */
export function OthersDataNotice() {
  const O = t.legal.othersData
  return (
    <p data-legal-consent style={lineStyle}>
      {O.start}
      <LegalLink to="/privacidad">{O.privacy}</LegalLink>
      {O.end}
    </p>
  )
}

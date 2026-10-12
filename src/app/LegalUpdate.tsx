/**
 * After the notice or the terms change, a person who accepted an older
 * version sees it once (TRUST-05): which document changed, a link to read
 * it, and «Entendido», which records the new version. «Cerrar» leaves it for
 * the next time the app opens. Never over the Tarjeta, the TV, the ceremony
 * or the printable cards, nor on the legal pages themselves.
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Sheet } from '../components/ui'
import { LegalLink } from '../components/LegalLinks'
import { useAuth } from '../data/auth'
import { acceptLegal, flushLegal, legalUpdate } from '../data/legal'
import { t } from '../i18n/es-MX'
import { QUIET_ROUTE, legalAsked, type Changed } from './legalUpdateState'

export function LegalUpdate() {
  const uid = useAuth((s) => s.user?.id ?? null)
  const quiet = QUIET_ROUTE.test(useLocation().pathname)
  const [changed, setChanged] = useState<Changed | null>(null)
  const [busy, setBusy] = useState(false)

  // An acceptance that waited for a session (an account's code still to be typed, no signal) goes now.
  useEffect(() => {
    if (uid) void flushLegal()
  }, [uid])

  useEffect(() => {
    if (!uid || quiet || legalAsked.dismissed === uid) {
      setChanged(null)
      return
    }
    let live = true
    const show = (c: Changed | null) => live && setChanged(c && (c.privacy || c.terms) ? c : null)
    if (legalAsked.asked?.uid === uid) show(legalAsked.asked.changed)
    else
      void legalUpdate().then((c) => {
        // Unknown (no signal, an older server): ask again next time.
        if (c) legalAsked.asked = { uid, changed: c }
        show(c)
      })
    return () => {
      live = false
    }
  }, [uid, quiet])

  if (!changed || !uid) return null
  const both = changed.privacy && changed.terms
  const U = t.legal.update
  const close = () => {
    legalAsked.dismissed = uid
    setChanged(null)
  }
  return (
    <Sheet open onClose={close} title={U.title(changed.privacy, changed.terms)}>
      <p>{U.body(both)}</p>
      <p style={{ display: 'flex', gap: 'var(--s4)', flexWrap: 'wrap' }}>
        {changed.privacy && <LegalLink to="/privacidad">{t.legal.privacy.title}</LegalLink>}
        {changed.terms && <LegalLink to="/terminos">{t.legal.terms.title}</LegalLink>}
      </p>
      <button
        className="btn btn--primary btn--block"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void acceptLegal('update').finally(() => {
            setBusy(false)
            legalAsked.asked = { uid, changed: { privacy: false, terms: false } }
            setChanged(null)
          })
        }}
      >
        {U.ok}
      </button>
    </Sheet>
  )
}

/**
 * After the notice or the terms change, a person who accepted an older
 * version sees which (TRUST-05), with a link to read it, and «Entendido»,
 * which records the new version; so does an account with no record yet (it
 * signed in from an email link, or before 0038), shown both. «Cerrar» leaves
 * it for the next time the app opens. Never over the Tarjeta, the auction
 * console, the room screens, the printable cards or the documents.
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Sheet } from '../components/ui'
import { LegalLink } from '../components/LegalLinks'
import { useAuth } from '../data/auth'
import { acceptLegal, flushLegal, legalUpdate } from '../data/legal'
import { t } from '../i18n/es-MX'
import { QUIET_ROUTE, SETTLE_MS, legalAsked, type Changed } from './legalUpdateState'
import { Button } from '../components/primitives'

export function LegalUpdate() {
  const uid = useAuth((s) => s.user?.id ?? null)
  // An anonymous phone that becomes an account in place keeps its uid: it is asked again as the account.
  const key = useAuth((s) => (s.user ? `${s.user.id}:${s.isAnonymous ? 'anon' : 'account'}` : null))
  const quiet = QUIET_ROUTE.test(useLocation().pathname)
  const [changed, setChanged] = useState<Changed | null>(null)
  const [busy, setBusy] = useState(false)

  // An acceptance that waited for signal goes now (it is dropped if it was another user's).
  useEffect(() => {
    if (uid) void flushLegal()
  }, [uid])

  useEffect(() => {
    if (!uid || !key || quiet || legalAsked.dismissed === key) {
      setChanged(null)
      return
    }
    let live = true
    const show = (c: Changed | null) => live && setChanged(c && (c.privacy || c.terms) ? c : null)
    if (legalAsked.asked?.key === key) {
      show(legalAsked.asked.changed)
      return () => {
        live = false
      }
    }
    // A moment after the session changes: the sign-in that changed it records its own acceptance first.
    const timer = setTimeout(() => {
      void legalUpdate().then((c) => {
        // Unknown (no signal, an older server): ask again next time.
        if (c) legalAsked.asked = { key, changed: c }
        show(c)
      })
    }, SETTLE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [uid, key, quiet])

  if (!changed || !uid || !key) return null
  const both = changed.privacy && changed.terms
  const first = changed.first === true
  const U = t.legal.update
  const close = () => {
    legalAsked.dismissed = key
    setChanged(null)
  }
  return (
    <Sheet open onClose={close} title={first ? U.firstTitle : U.title(changed.privacy, changed.terms)}>
      <p>{first ? U.firstBody : U.body(both)}</p>
      <p style={{ display: 'flex', gap: 'var(--s4)', flexWrap: 'wrap' }}>
        {changed.privacy && <LegalLink to="/privacidad">{t.legal.privacy.title}</LegalLink>}
        {changed.terms && <LegalLink to="/terminos">{t.legal.terms.title}</LegalLink>}
      </p>
      <Button
        variant="primary"
        block

        disabled={busy}
        onClick={() => {
          setBusy(true)
          void acceptLegal('update').finally(() => {
            setBusy(false)
            legalAsked.asked = { key, changed: { privacy: false, terms: false } }
            setChanged(null)
          })
        }}
      >
        {U.ok}
      </Button>
    </Sheet>
  )
}

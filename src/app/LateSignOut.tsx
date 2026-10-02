import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from '../components/ui'
import { t } from '../i18n/es-MX'
import { useLateSignOut } from '../data/account'

/**
 * A sign-out that ended after its screen had said the person was still
 * signed in (lie-fi, an expired token still refreshing): what the phone kept
 * of them is gone by then (account.ts), and nothing of theirs stays on screen
 * for the next person either. The phone goes home and says so, once.
 */
export function LateSignOutHome() {
  const navigate = useNavigate()
  const at = useLateSignOut((s) => s.at)
  useEffect(() => {
    if (!at) return
    useLateSignOut.setState({ at: null })
    toast(t.account.signedOutLate)
    navigate('/', { replace: true })
  }, [at, navigate])
  return null
}

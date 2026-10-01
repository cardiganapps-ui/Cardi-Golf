/**
 * `/perfil/vuelta`: where Google sends people back. Finishes the sign-in
 * (profile, the device's player) or explains what went wrong. When the
 * Google account already belongs to another Polo account, offers to sign in
 * to that one instead, bringing this device's player along.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Spinner } from '../../components/ui'
import { useAuth } from '../../data/auth'
import { accountError, finishProfileSignIn, safeNext, signInWithGoogleInstead } from '../../data/account'
import { humanError } from '../../lib/humanError'
import styles from './Profile.module.css'

export function OAuthReturnScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { ready, user, isAnonymous } = useAuth()
  const [state, setState] = useState<'working' | 'taken' | 'error'>('working')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    // Errors come back in the query (PKCE) or in the hash (implicit flow).
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const code = params.get('error_code') ?? hash.get('error_code')
    if (code === 'identity_already_exists') {
      started.current = true
      setState('taken')
      return
    }
    if (code || params.get('error') || hash.get('error')) {
      started.current = true
      setState('error')
      // Never the provider's error_description: it is English at best, and anyone can put any text in a link (COPY-04).
      setMessage(code ? humanError({ code }) : null)
      return
    }
    if (!ready) return
    started.current = true
    if (!user || isAnonymous) {
      setState('error')
      return
    }
    finishProfileSignIn()
      .then((done) => navigate(done.firstTime ? `/perfil/editar?bienvenida=1&next=${encodeURIComponent(next)}` : next, { replace: true }))
      .catch((e) => {
        setState('error')
        setMessage(accountError(e))
      })
  }, [ready, user, isAnonymous, params, navigate, next])

  return (
    <div className={`${styles.screen} ${styles.narrow}`}>
      <Link to="/" className={styles.brand}>
        <Wordmark />
      </Link>
      {state === 'working' && <Spinner label={t.account.returning} />}
      {state === 'taken' && (
        <div className={styles.form}>
          <h1>{t.account.googleTaken}</h1>
          <button
            className="btn btn--primary btn--block"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              signInWithGoogleInstead(next).catch((e) => {
                setBusy(false)
                setState('error')
                setMessage(accountError(e))
              })
            }}
          >
            {t.account.googleTakenAction}
          </button>
          <Link className="btn btn--ghost" to={`/entrar?next=${encodeURIComponent(next)}`}>
            {t.account.or}
          </Link>
        </div>
      )}
      {state === 'error' && (
        <div className={styles.form}>
          <h1>{t.account.returnFailed}</h1>
          {message && <p className={styles.help}>{message}</p>}
          <Link className="btn btn--primary btn--block" to={`/entrar?next=${encodeURIComponent(next)}`}>
            {t.account.enterProfile}
          </Link>
        </div>
      )}
    </div>
  )
}

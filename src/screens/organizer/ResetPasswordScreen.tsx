import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { EmptyState } from '../../components/primitives'
import { Field, Spinner } from '../../components/ui'
import { updatePassword, useAuth } from '../../data/auth'
import styles from './OrganizerAuth.module.css'

/** Landing page of the password-reset email; also "Cambiar contraseña" from Más. */
export function ResetPasswordScreen() {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const signedIn = !!user && !isAnonymous
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      navigate('/organizer', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.screen}>
      <Link to="/" className={styles.brand}>
        <Wordmark />
      </Link>
      <header className={styles.head}>
        <h1>{t.auth.resetTitle}</h1>
      </header>
      {!ready && <Spinner rows={2} />}
      {ready && !signedIn && (
        <EmptyState
          title={t.auth.resetExpired}
          body=""
          action={
            <Link className="btn btn--secondary" to="/organizer/login">
              {t.auth.signIn}
            </Link>
          }
        />
      )}
      {ready && signedIn && (
        <form className={styles.form} onSubmit={submit}>
          <p className="help">{user?.email}</p>
          <Field label={t.auth.newPassword} hint={t.auth.passwordHint}>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy || password.length < 8}>
            {busy ? t.common.saving : t.common.save}
          </button>
        </form>
      )}
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Field, Spinner } from '../../components/ui'
import { updatePassword, useAuth } from '../../data/auth'

/** Landing page of the password-reset email; also "Cambiar contraseña" from Más. */
export function ResetPasswordScreen() {
  const navigate = useNavigate()
  const { ready, user } = useAuth()
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
    <div className="screen">
      <Link to="/" style={{ textDecoration: 'none' }}>
        <Wordmark />
      </Link>
      <h1>{t.auth.resetTitle}</h1>
      {!ready && <Spinner />}
      {ready && !user && (
        <p className="muted">
          {t.auth.needsConfirmation} <Link to="/organizer/login">{t.auth.signIn}</Link>
        </p>
      )}
      {ready && user && (
        <form className="stack" onSubmit={submit}>
          <p className="help">{user.email}</p>
          <Field label={t.auth.newPassword} hint={t.auth.passwordHint}>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus />
          </Field>
          {error && <p className="error">{error}</p>}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy || password.length < 8}>
            {t.common.save}
          </button>
        </form>
      )}
    </div>
  )
}

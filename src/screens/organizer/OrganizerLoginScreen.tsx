import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Field } from '../../components/ui'
import { requestPasswordReset, signInWithMagicLink, signInWithPassword, signUpWithPassword, useAuth } from '../../data/auth'

export function OrganizerLoginScreen() {
  const navigate = useNavigate()
  const { user, isAnonymous } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (user && !isAnonymous) {
    navigate('/organizer', { replace: true })
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'in') {
        await signInWithPassword(email.trim(), password)
        navigate('/organizer', { replace: true })
      } else {
        const r = await signUpWithPassword(email.trim(), password, name.trim())
        if (r.needsConfirmation) setInfo(t.auth.needsConfirmation)
        else navigate('/organizer', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function magic() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      await signInWithMagicLink(email.trim())
      setInfo(t.auth.magicSent)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email.trim())
      setInfo(t.auth.resetSent)
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
      <h1>{t.auth.title}</h1>
      {user && isAnonymous && <p className="help">{t.auth.anonymousWarning}</p>}
      <form className="stack" onSubmit={submit}>
        {mode === 'up' && (
          <Field label={t.auth.displayName}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
        )}
        <Field label={t.auth.email}>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        </Field>
        <Field label={t.auth.password} hint={mode === 'up' ? t.auth.passwordHint : undefined}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </Field>
        {error && <p className="error">{error}</p>}
        {info && <p className="teal">{info}</p>}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {mode === 'in' ? t.auth.signIn : t.auth.signUp}
        </button>
        <button className="btn btn--ghost" type="button" onClick={magic} disabled={busy || !email.trim()}>
          {t.auth.magicLink}
        </button>
        {mode === 'in' && (
          <button className="btn btn--ghost" type="button" onClick={forgot} disabled={busy || !email.trim()}>
            {t.auth.forgot}
          </button>
        )}
        <button className="btn btn--ghost" type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t.auth.toggleToSignUp : t.auth.toggleToSignIn}
        </button>
      </form>
    </div>
  )
}

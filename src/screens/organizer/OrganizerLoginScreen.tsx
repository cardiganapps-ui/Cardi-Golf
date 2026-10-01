import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Field } from '../../components/ui'
import { Input } from '../../components/primitives'
import { requestPasswordReset, resendEmailCode, signInWithMagicLink, signInWithPassword, signUpWithPassword, useAuth, verifyEmailCode } from '../../data/auth'
import styles from './OrganizerAuth.module.css'
import { humanError, UserError } from '../../lib/humanError'

/** Organizer sign-in. One primary path (email + password); the alternatives are quiet. */
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
  /** Waiting for the emailed code: after sign-up (`signup`) or a magic-link request (`email`). */
  const [awaiting, setAwaiting] = useState<'signup' | 'email' | null>(null)
  const [code, setCode] = useState('')

  const signedIn = !!user && !isAnonymous
  useEffect(() => {
    if (signedIn) navigate('/organizer', { replace: true })
  }, [signedIn, navigate])
  if (signedIn) return null

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await action()
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      if (mode === 'in') {
        await signInWithPassword(email.trim(), password)
        navigate('/organizer', { replace: true })
      } else {
        const r = await signUpWithPassword(email.trim(), password, name.trim())
        if (r.needsConfirmation) setAwaiting('signup')
        else navigate('/organizer', { replace: true })
      }
    })
  }

  const hasEmail = email.trim().length > 0

  return (
    <div className={styles.screen}>
      <Link to="/" className={styles.brand}>
        <Wordmark />
      </Link>
      <header className={styles.head}>
        <h1>{t.auth.title}</h1>
        <p className={styles.lede}>{t.auth.intro}</p>
        {user && isAnonymous && <p className="help">{t.auth.anonymousWarning}</p>}
      </header>

      {awaiting ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              try {
                await verifyEmailCode(email.trim(), code, awaiting)
              } catch {
                throw new UserError(t.auth.badCode)
              }
              navigate('/organizer', { replace: true })
            })
          }}
        >
          <p className={styles.notice} role="status">
            {info ?? (awaiting === 'signup' ? t.auth.needsConfirmation : t.auth.magicSent)}
          </p>
          <Field label={t.auth.code} hint={t.auth.codeHint}>
            <Input code value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          </Field>
          <p className="help">{t.auth.codeSentTo(email.trim())}</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy || code.length < 6}>
            {busy ? t.auth.confirming : t.auth.confirmCode}
          </button>
          <div className={styles.quiet}>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await resendEmailCode(email.trim(), awaiting)
                  setInfo(t.auth.resent)
                })
              }
            >
              {t.auth.resend}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => {
                setAwaiting(null)
                setCode('')
                setError(null)
                setInfo(null)
              }}
            >
              {t.auth.otherEmail}
            </button>
          </div>
        </form>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          {mode === 'up' && (
            <Field label={t.auth.displayName}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
          )}
          <Field label={t.auth.email}>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
          </Field>
          <Field label={t.auth.password} hint={mode === 'up' ? t.auth.passwordHint : undefined}>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={8} required />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className={styles.notice} role="status">
              {info}
            </p>
          )}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? (mode === 'in' ? t.auth.signingIn : t.auth.creating) : mode === 'in' ? t.auth.signIn : t.auth.signUp}
          </button>
          {mode === 'in' && (
            <div className={styles.quiet}>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() =>
                  void run(async () => {
                    await signInWithMagicLink(email.trim())
                    setAwaiting('email')
                  })
                }
                disabled={busy || !hasEmail}
              >
                {t.auth.magicLink}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() =>
                  void run(async () => {
                    await requestPasswordReset(email.trim())
                    setInfo(t.auth.resetSent)
                  })
                }
                disabled={busy || !hasEmail}
              >
                {t.auth.forgot}
              </button>
            </div>
          )}
        </form>
      )}

      {!awaiting && (
        <div className={styles.switch}>
          <span>{mode === 'in' ? t.auth.firstTime : t.auth.haveAccount}</span>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? t.auth.toggleToSignUp : t.auth.toggleToSignIn}
          </button>
        </div>
      )}
    </div>
  )
}

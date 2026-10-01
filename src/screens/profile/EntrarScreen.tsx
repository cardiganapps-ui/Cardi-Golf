/**
 * `/entrar`: save your profile, or sign in to it on this phone. One field
 * (the email), one code. An anonymous device that played a tournament
 * becomes the account in place, so nothing it holds is lost; Google appears
 * only when the project has it on and the OAuth return can land in this app.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Field } from '../../components/ui'
import { Input } from '../../components/primitives'
import { IconGoogle } from '../../components/icons'
import { useAuth } from '../../data/auth'
import { accountError, confirmProfileCode, continueWithGoogle, finishProfileSignIn, googleAvailable, resendProfileCode, safeNext, sendProfileCode, type CodeMode } from '../../data/account'
import { myDeviceClaim } from '../../data/profiles'
import { supabase } from '../../lib/supabase'
import styles from './Profile.module.css'
import { LegalConsent } from '../../components/LegalLinks'

export function EntrarScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { ready, user, isAnonymous } = useAuth()
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<CodeMode | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [google, setGoogle] = useState(false)
  /** "Lo que jugaste como Nico en Ensayo": shown when this device holds a player. */
  const [claimed, setClaimed] = useState<{ name: string; tournament: string } | null>(null)
  const [finishing, setFinishing] = useState(false)

  const signedIn = !!user && !isAnonymous
  useEffect(() => {
    if (ready && signedIn && !mode && !finishing) navigate(next, { replace: true })
  }, [ready, signedIn, mode, finishing, next, navigate])

  useEffect(() => {
    void googleAvailable().then(setGoogle)
  }, [])

  useEffect(() => {
    if (!ready || !user || !isAnonymous) return
    let live = true
    void (async () => {
      const claim = await myDeviceClaim().catch(() => null)
      if (!claim || !live) return
      const sb = supabase()
      const [{ data: p }, { data: tr }] = await Promise.all([
        sb.from('players').select('display_name').eq('id', claim.playerId).maybeSingle(),
        sb.from('tournaments').select('name').eq('id', claim.tournamentId).maybeSingle(),
      ])
      if (live && p && tr) setClaimed({ name: p.display_name as string, tournament: tr.name as string })
    })()
    return () => {
      live = false
    }
  }, [ready, user, isAnonymous])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(accountError(e))
    } finally {
      setBusy(false)
    }
  }

  function send(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      setInfo(null)
      setMode(await sendProfileCode(email.trim()))
    })
  }

  function confirm(e: FormEvent) {
    e.preventDefault()
    if (!mode) return
    void run(async () => {
      setFinishing(true)
      try {
        await confirmProfileCode(email.trim(), code, mode)
      } catch (err) {
        setFinishing(false)
        throw err
      }
      const done = await finishProfileSignIn()
      navigate(done.firstTime ? `/perfil/editar?bienvenida=1&next=${encodeURIComponent(next)}` : next, { replace: true })
    })
  }

  return (
    <div className={`${styles.screen} ${styles.narrow}`}>
      <Link to="/" className={styles.brand}>
        <Wordmark />
      </Link>
      <header className={styles.head}>
        <h1>{claimed ? t.account.saveTitle : t.account.title}</h1>
        <p className={styles.lede}>{claimed ? t.account.saveLede(claimed.name, claimed.tournament) : t.account.lede}</p>
      </header>

      {mode ? (
        <form className={styles.form} onSubmit={confirm}>
          <p className={styles.notice} role="status">
            {info ?? t.account.codeSent(email.trim())}
          </p>
          <Field label={t.auth.code} hint={t.auth.codeHint}>
            <Input code value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          </Field>
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
                  await resendProfileCode(email.trim(), mode)
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
                setMode(null)
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
        <div className={styles.form}>
          {google && (
            <>
              <button className={`btn btn--secondary btn--block ${styles.google}`} type="button" disabled={busy} onClick={() => void run(() => continueWithGoogle(next))}>
                <IconGoogle /> {t.account.google}
              </button>
              <span className={styles.divider}>{t.account.or}</span>
            </>
          )}
          <form className={styles.form} onSubmit={send}>
            <Field label={t.account.email}>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn--primary btn--block" type="submit" disabled={busy || !email.trim()}>
              {busy ? t.account.sending : t.account.sendCode}
            </button>
          </form>
          <LegalConsent />
        </div>
      )}
    </div>
  )
}

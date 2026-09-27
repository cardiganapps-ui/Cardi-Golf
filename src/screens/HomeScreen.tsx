import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wave } from '../components/Wave'
import { Wordmark } from '../components/Wordmark'
import { InstallGuide } from '../components/InstallGuide'
import { supabaseConfigured } from '../lib/supabase'
import { getLastTournament } from '../data/session'
import { useAuth } from '../data/auth'
import styles from './HomeScreen.module.css'

export function HomeScreen() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const last = getLastTournament()
  const { user, isAnonymous } = useAuth()
  const organizerSignedIn = !!user && !isAnonymous

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length !== 6) return
    navigate(`/t/${clean}`)
  }

  return (
    <div className={styles.home}>
      <header className={styles.hero}>
        <Wordmark size="lg" />
        <p className={styles.tagline}>{t.app.tagline}</p>
        <p className="muted">{t.app.description}</p>
        <Wave className={styles.wave} />
      </header>

      {!supabaseConfigured && (
        <div className={`card ${styles.warn}`} role="alert">
          {t.errors.missingEnv}
        </div>
      )}

      {last && (
        <Link className="btn btn--primary btn--block" to={`/t/${last.slug}`}>
          {t.home.backTo(last.name)}
        </Link>
      )}

      <section className="card">
        <span className="section-num">01</span>
        <h2>{t.home.joinTitle}</h2>
        <p className="muted">{t.home.joinHint}</p>
        <form className={styles.joinForm} onSubmit={onJoin}>
          <label className="sr-only" htmlFor="join-code">
            {t.home.joinPlaceholder}
          </label>
          <input
            id="join-code"
            className={`input num ${styles.codeInput}`}
            placeholder={t.home.joinPlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            maxLength={6}
          />
          <button className="btn btn--primary" type="submit" disabled={code.trim().length !== 6}>
            {t.home.joinButton}
          </button>
        </form>
      </section>

      <section className="card card--cell">
        <span className="section-num">02</span>
        <h2>{t.home.organizerTitle}</h2>
        <p className="muted">{t.home.organizerHint}</p>
        <div style={{ marginTop: 12 }}>
          <Link className="btn btn--secondary" to={organizerSignedIn ? '/organizer' : '/organizer/login'}>
            {organizerSignedIn ? t.home.myTournaments : t.home.organizerButton}
          </Link>
        </div>
      </section>

      <InstallGuide />
    </div>
  )
}

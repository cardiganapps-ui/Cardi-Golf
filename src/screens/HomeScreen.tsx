import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wave } from '../components/Wave'
import { Wordmark } from '../components/Wordmark'
import { InstallGuide } from '../components/InstallGuide'
import { supabaseConfigured } from '../lib/supabase'
import styles from './HomeScreen.module.css'

export function HomeScreen() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

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
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
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
        <button className="btn btn--secondary" type="button" disabled title={t.home.comingSoon}>
          {t.home.organizerButton}
        </button>
        <p className={`muted ${styles.soon}`}>{t.home.comingSoon}</p>
      </section>

      <InstallGuide />
    </div>
  )
}

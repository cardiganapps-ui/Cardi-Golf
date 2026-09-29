import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import { InstallGuide } from '../components/InstallGuide'
import { LegalLinks } from '../components/LegalLinks'
import { supabaseConfigured } from '../lib/supabase'
import { getLastTournament } from '../data/session'
import { useAuth } from '../data/auth'
import { MiPolo } from './profile/MiPolo'
import styles from './HomeScreen.module.css'

/**
 * `/`: one line on what Polo does, then the fastest way in. A returning
 * player sees their tournament first; everyone else sees the code field.
 * Organizers get one quiet link.
 */
export function HomeScreen() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const last = getLastTournament()
  const { ready, user, isAnonymous } = useAuth()
  const organizerSignedIn = !!user && !isAnonymous

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length !== 6) return
    navigate(`/t/${clean}`)
  }

  // Accounts live in Mi Polo; wait for the stored session so they don't see this page flash first.
  if (supabaseConfigured && !ready) return null
  if (organizerSignedIn) return <MiPolo />

  return (
    <div className={styles.home}>
      <header className={styles.intro}>
        <Wordmark size="lg" />
        <p className={styles.lede}>{t.app.description}</p>
      </header>

      {!supabaseConfigured && (
        <div className="card card--alert" role="alert">
          <strong>{t.common.error}</strong>
          <p className="small">{t.errors.missingEnv}</p>
        </div>
      )}

      {last && (
        <section className={styles.last}>
          <span className="label">{t.home.lastTournament}</span>
          <span className={styles.lastName}>{last.name}</span>
          <Link className="btn btn--primary btn--block" to={`/t/${last.slug}`}>
            {t.home.joinButton}
          </Link>
        </section>
      )}

      <section className={styles.section}>
        <h2>{t.home.joinTitle}</h2>
        <p className="help">{t.home.joinHint}</p>
        <form className={styles.joinForm} onSubmit={onJoin}>
          <label className="sr-only" htmlFor="join-code">
            {t.home.joinPlaceholder}
          </label>
          <input
            id="join-code"
            className={`input ${styles.codeInput}`}
            placeholder={t.home.joinPlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            maxLength={6}
          />
          <button className={`btn ${last ? 'btn--secondary' : 'btn--primary'}`} type="submit" disabled={code.trim().length !== 6}>
            {t.home.joinButton}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2>{t.profile.myProfile}</h2>
        <div className={styles.quiet}>
          <span className="help">{t.account.enterProfileHint}</span>
          <Link className="btn btn--ghost btn--sm" to="/entrar">
            {t.account.enterProfile}
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <h2>{t.home.organizerTitle}</h2>
        <div className={styles.quiet}>
          <span className="help">{t.home.organizerHint}</span>
          <Link className="btn btn--ghost btn--sm" to={organizerSignedIn ? '/organizer' : '/organizer/login'}>
            {organizerSignedIn ? t.home.myTournaments : t.home.organizerButton}
          </Link>
        </div>
      </section>

      <InstallGuide />
      <LegalLinks />
    </div>
  )
}

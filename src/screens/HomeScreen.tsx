import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../i18n/es-MX'
import { Wordmark } from '../components/Wordmark'
import { InstallGuide } from '../components/InstallGuide'
import { LegalLinks } from '../components/LegalLinks'
import { supabaseConfigured } from '../lib/supabase'
import { getLastTournament, type LastTournament } from '../data/session'
import { hasCached } from '../data/snapshotCache'
import { hasStoredSession, useAuth } from '../data/auth'
import { BootProblem } from '../components/BootProblem'
import { Spinner } from '../components/ui'
import { MiPolo } from './profile/MiPolo'
import styles from './HomeScreen.module.css'

/**
 * `/`: one line on what Polo does, then one way in.
 *
 * It used to offer three at equal weight — a code, a profile and an
 * organizer sign-in, each with its own heading — so the first screen asked
 * a stranger to choose between three things before knowing what any of them
 * was. Almost everyone arrives with a code a friend sent, so that is the
 * door; everything else is one quiet row underneath.
 */
export function HomeScreen() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const last = getLastTournament()
  const saved = useSavedOnPhone(last?.slug)
  const { ready, user, isAnonymous, bootError } = useAuth()
  const organizerSignedIn = !!user && !isAnonymous

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length !== 6) return
    navigate(`/t/${clean}`)
  }

  // Accounts live in Mi Polo; wait for the stored session so they don't see
  // this page flash first. Never render nothing while waiting: that was the
  // blank white page. And if the session could not be confirmed on a device
  // that has one, say so, rather than showing a signed-in person the guest page.
  // Either way the last tournament's boards saved on the phone open at once:
  // they need no session, and the installed app opens here (REL-03).
  if (supabaseConfigured && !ready) return <BootWait last={saved ? last : null} />
  if (bootError && !user && hasStoredSession()) return <BootProblem kind={bootError} saved={saved ? last?.slug : undefined} />
  // Mi Polo needs the server for the profile; the saved boards don't (REL-15).
  if (organizerSignedIn) return <MiPolo saved={saved && last ? { slug: last.slug, card: <LastTournamentCard last={last} /> } : undefined} />

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

      {last && <LastTournamentCard last={last} />}

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

      {/* Everything that is not "I was invited to a tournament", in one row.
          Ronda rápida needs an account, so it goes through the same door. */}
      <nav className={styles.doors} aria-label={t.home.otherWays}>
        <Link className={styles.door} to="/entrar">
          {t.account.enterProfile}
        </Link>
        <Link className={styles.door} to="/entrar">
          {t.home.quickRound}
        </Link>
        <Link className={styles.door} to={organizerSignedIn ? '/organizer' : '/organizer/login'}>
          {organizerSignedIn ? t.home.myTournaments : t.home.organizerButton}
        </Link>
      </nav>

      <InstallGuide />
      <LegalLinks />
    </div>
  )
}

/** The returning player's tournament: its name and one primary button. */
function LastTournamentCard({ last }: { last: LastTournament }) {
  return (
    <section className={styles.last}>
      <span className="label">{t.home.lastTournament}</span>
      <span className={styles.lastName}>{last.name}</span>
      <Link className="btn btn--primary btn--block" to={`/t/${last.slug}`}>
        {t.home.joinButton}
      </Link>
    </section>
  )
}

/** Whether the phone has the boards of the tournament at `slug` saved (an IndexedDB read, no network). */
function useSavedOnPhone(slug: string | undefined): boolean {
  const [saved, setSaved] = useState<{ slug: string; yes: boolean } | null>(null)
  useEffect(() => {
    if (!slug) return
    let live = true
    void hasCached(slug).then((yes) => live && setSaved({ slug, yes }))
    return () => {
      live = false
    }
  }, [slug])
  return !!slug && saved?.slug === slug && saved.yes
}

/** While the session is being confirmed: the brand, a sign of life, and the tournament saved on the phone, which opens without it. */
function BootWait({ last }: { last: LastTournament | null }) {
  return (
    <div className={styles.home} aria-busy="true">
      <header className={styles.intro}>
        <Wordmark size="lg" />
      </header>
      {last && <LastTournamentCard last={last} />}
      <Spinner />
    </div>
  )
}

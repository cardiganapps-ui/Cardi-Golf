/**
 * At the foot of En vivo on a link to watch (STRAT-05): what this page is,
 * the TV mode, and the link to pass on. Nothing for the tournament's own
 * people, whose En vivo stays as it was. On the example tournament (`/demo`,
 * STRAT-17) it says the people are made up, and offers to organize one.
 */
import { memo } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { CopyButton, ShareButton } from '../../components/ui'
import { IconTv } from '../../components/icons'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/tournamentContext'
import styles from './SpectatorNote.module.css'

/** Memoized: it reads two words, never the boards, so a score saved elsewhere renders nothing here (PERF-09). */
export const SpectatorNote = memo(function SpectatorNote() {
  const { spectator, base } = useTournamentCtx()
  const name = useTournament((s) => s.data?.snapshot.tournament.name ?? '')
  if (!spectator) return null
  return (
    <section className={styles.note} aria-label={spectator.demo ? t.demo.title : t.spectator.title}>
      <p className="help">{spectator.demo ? t.demo.foot : spectator.money ? t.spectator.noteMoney : t.spectator.note}</p>
      <div className={styles.actions}>
        {spectator.demo && (
          <Link className="btn btn--primary btn--sm" to="/organizer/login">
            {t.demo.organize}
          </Link>
        )}
        <Link className="btn btn--secondary btn--sm" to={`${base}/tv`}>
          <IconTv /> {t.spectator.viewTv}
        </Link>
        <CopyButton text={spectator.url} label={t.spectator.copy} />
        <ShareButton text={spectator.demo ? t.demo.shareText : t.spectator.shareText(name)} url={spectator.url} title={name} />
      </div>
    </section>
  )
})

/** The top of En vivo on the example tournament (STRAT-17): what it is, before anyone reads a name as a real one. */
export const DemoIntro = memo(function DemoIntro() {
  const { spectator } = useTournamentCtx()
  if (!spectator?.demo) return null
  return (
    <section className={styles.intro} aria-label={t.demo.title}>
      <p className={styles.introLead}>{t.demo.intro}</p>
      <p className="help">{t.demo.introHint}</p>
    </section>
  )
})

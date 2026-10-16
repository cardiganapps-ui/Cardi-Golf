/**
 * At the foot of En vivo on a link to watch (STRAT-05): what this page is,
 * the TV mode, and the link to pass on. Nothing for the tournament's own
 * people, whose En vivo stays as it was.
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
    <section className={styles.note} aria-label={t.spectator.title}>
      <p className="help">{spectator.money ? t.spectator.noteMoney : t.spectator.note}</p>
      <div className={styles.actions}>
        <Link className="btn btn--secondary btn--sm" to={`${base}/tv`}>
          <IconTv /> {t.spectator.viewTv}
        </Link>
        <CopyButton text={spectator.url} label={t.spectator.copy} />
        <ShareButton text={t.spectator.shareText(name)} url={spectator.url} title={name} />
      </div>
    </section>
  )
})

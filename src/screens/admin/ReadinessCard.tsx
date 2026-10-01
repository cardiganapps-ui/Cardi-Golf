/**
 * «Para empezar» at the top of Comité › Torneo (UX-06): what is done, what is
 * missing, and one tap to the section that fixes it. Once the tournament is
 * under way it prepares the next day instead («Antes del día 2»), and says
 * nothing when no day is left to play. Gone once everything is ready, and
 * for quick rounds, which are created ready to play.
 */
import { useId } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { IconCheck, IconChevronRight } from '../../components/icons'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { useEntryInfo } from './entryInfo'
import { checkedText, hrefOf, nextRound, readiness, setupBadge } from './readiness'
import styles from './ReadinessCard.module.css'

export function ReadinessCard() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const headId = useId()
  const entry = useEntryInfo(tournamentId, data?.snapshot.players)
  if (!data) return null
  const { snapshot, settings, state } = data
  if (snapshot.tournament.quick || snapshot.tournament.status === 'finished') return null
  const R = t.admin.ready
  const setup = snapshot.tournament.status === 'setup'
  const next = nextRound(snapshot)
  // Under way with every day left cancelled: there is no next day to prepare.
  if (!setup && !next) return null
  const items = readiness(snapshot, settings, { pins: entry?.pins ?? null, linked: entry?.linked, bracket: state.bracket })
  if (items.every((i) => i.done)) {
    // «Listo» only once the PINs are known, and only when the engine warns about nothing the list doesn't say: the Torneo tab reads 0.
    const clear = setupBadge(items, state.flags.warnings, state.flags.missingModules.length) === 0
    return setup && entry && clear ? <p className={styles.allSet}>{R.allSet(checkedText(items))}</p> : null
  }
  const day = !setup && next ? next.number : null
  return (
    <section className={styles.card} aria-labelledby={headId}>
      <h3 id={headId} className={styles.title}>
        {day ? R.titleNext(day) : R.title}
      </h3>
      <p className={styles.hint}>{day ? R.hintNext(day) : R.hint}</p>
      <ul className={styles.list}>
        {items.map((i) => (
          <li key={i.id}>
            <Link className={`${styles.row} ${i.done ? styles.done : ''}`} to={hrefOf(slug, i)}>
              <span className={styles.mark} aria-hidden="true">
                {i.done ? <IconCheck size={18} /> : null}
              </span>
              <span className={styles.text}>
                <span className="sr-only">{i.done ? `${R.doneLabel}: ` : `${R.todoLabel}: `}</span>
                {i.text}
              </span>
              <IconChevronRight size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

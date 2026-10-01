/**
 * «Para empezar» at the top of Comité › Torneo (UX-06): what is done, what is
 * missing, and one tap to the section that fixes it. Once the tournament is
 * under way it prepares the next day instead («Antes del día 2»). Gone once
 * everything is ready, and for quick rounds, which are created ready to play.
 */
import { useId } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { IconCheck, IconChevronRight } from '../../components/icons'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { useEntryInfo } from './entryInfo'
import { nextRound, readiness } from './readiness'
import styles from './ReadinessCard.module.css'

export function ReadinessCard() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const headId = useId()
  const entry = useEntryInfo(tournamentId, data?.snapshot.players.map((p) => p.id) ?? [])
  if (!data) return null
  const { snapshot, settings, state } = data
  if (snapshot.tournament.quick || snapshot.tournament.status === 'finished') return null
  const R = t.admin.ready
  const items = readiness(snapshot, settings, { pins: entry?.pins ?? null, linked: entry?.linked, bracket: state.bracket })
  const setup = snapshot.tournament.status === 'setup'
  if (items.every((i) => i.done)) {
    // «Listo» only once the PINs are known: until then the PIN line is not on the list.
    return setup && entry ? <p className={styles.allSet}>{R.allSet}</p> : null
  }
  const next = setup ? undefined : nextRound(snapshot)
  return (
    <section className={styles.card} aria-labelledby={headId}>
      <h3 id={headId} className={styles.title}>
        {next ? R.titleNext(next.number) : R.title}
      </h3>
      <p className={styles.hint}>{next ? R.hintNext(next.number) : R.hint}</p>
      <ul className={styles.list}>
        {items.map((i) => (
          <li key={i.id}>
            <Link className={`${styles.row} ${i.done ? styles.done : ''}`} to={`/t/${slug}/admin/${i.to}${i.roundId ? `?ronda=${i.roundId}` : ''}`}>
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

/**
 * «Para empezar» at the top of Comité › Torneo (UX-06): what is done, what is
 * missing, and one tap to the section that fixes it. Gone once the tournament
 * is ready, and for quick rounds, which are created ready to play.
 */
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { IconCheck, IconChevronRight } from '../../components/icons'
import { playersWithPin } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { readiness } from './readiness'
import styles from './ReadinessCard.module.css'

export function ReadinessCard() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const headId = useId()
  const [pins, setPins] = useState<Set<string> | null>(null)
  const playerCount = data?.snapshot.players.length ?? 0
  useEffect(() => {
    // The design fixtures have no server to ask; their PIN line is left out.
    if (tournamentId.startsWith('fixture:')) return
    let alive = true
    playersWithPin(tournamentId)
      .then((p) => alive && setPins(p))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [tournamentId, playerCount])
  if (!data) return null
  const { snapshot, settings } = data
  if (snapshot.tournament.quick || snapshot.tournament.status === 'finished') return null
  const R = t.admin.ready
  const items = readiness(snapshot, settings, pins)
  if (items.every((i) => i.done)) return snapshot.tournament.status === 'setup' ? <p className={styles.allSet}>{R.allSet}</p> : null
  return (
    <section className={styles.card} aria-labelledby={headId}>
      <h3 id={headId} className={styles.title}>
        {R.title}
      </h3>
      <p className={styles.hint}>{R.hint}</p>
      <ul className={styles.list}>
        {items.map((i) => (
          <li key={i.id}>
            <Link className={`${styles.row} ${i.done ? styles.done : ''}`} to={`/t/${slug}/admin/${i.to}`}>
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

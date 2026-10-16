/**
 * Reglamento (§9.8): §5 as friendly Spanish copy. Which sections and lines a
 * tournament gets comes from its settings (`reglamento`, COPY-11, COPY-12),
 * so it always mirrors what the engine runs.
 */
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { reglamento } from '../../engine/settings/reglamento'
import styles from './RulesScreen.module.css'

const R = t.rules

export function RulesScreen() {
  const data = useTournament((s) => s.data)
  if (!data) return null
  const { snapshot, settings } = data
  const sections = reglamento(snapshot, settings)

  return (
    <div className={styles.screen}>
      <h1>{R.title}</h1>
      <p className={styles.intro}>{R.intro(snapshot.tournament.name)}</p>
      {sections.map((s) => (
        <section key={s.id} className={styles.section} data-section={s.id}>
          <div className={styles.head}>
            <h2>{s.title}</h2>
          </div>
          <ul className={styles.lines}>
            {s.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

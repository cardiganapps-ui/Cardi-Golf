/**
 * The bracket, as a column of rounds.
 *
 * Not the fanned-out tree a TV graphic draws: on a phone that means either
 * a horizontal scroll or type nobody can read. A column of rounds says the
 * same thing — who plays whom, who won, who is through — and reads at 360px.
 */
import { t } from '../../i18n/es-MX'
import type { BracketState } from '../../engine/formats/bracket'
import styles from './BracketBoard.module.css'

const B = t.bracket

export function BracketBoard({ bracket }: { bracket: BracketState }) {
  if (!bracket.rounds.length) return <p className="help">{bracket.warnings[0] ?? B.empty}</p>
  return (
    <div className={styles.board}>
      {bracket.champion && (
        <p className={styles.champion}>
          <span className="label">{B.champion}</span>
          <strong>{bracket.champion.name}</strong>
        </p>
      )}
      {bracket.rounds.map((round) => (
        <section key={round.number} className={styles.round}>
          <h3 className={styles.roundName}>{round.name}</h3>
          {round.matches.map((match, i) => {
            const [a, b] = match.sides
            return (
              <div key={`${a.id}-${b?.id ?? i}`} className={styles.match}>
                <span className={`${styles.side} ${match.winner?.id === a.id ? styles.won : ''}`}>{a.name}</span>
                <span className={styles.result}>{b ? match.text : B.bye}</span>
                <span className={`${styles.side} ${styles.sideRight} ${match.winner && b && match.winner.id === b.id ? styles.won : ''}`}>{b?.name ?? '—'}</span>
              </div>
            )
          })}
        </section>
      ))}
      {bracket.warnings.map((w) => (
        <p key={w} className="help">
          {w}
        </p>
      ))}
    </div>
  )
}

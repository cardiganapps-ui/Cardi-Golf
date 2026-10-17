import { t } from '../../../i18n/es-MX'
import type { HoleContest } from './useContestPicks'
import styles from '../ScorecardScreen.module.css'

const S = t.card

/** The hole's contests (closest to the pin, greenies...): who won each, or «Nadie», saved with the hole. */
export function HoleContests(p: {
  contests: HoleContest[]
  /** What the group picked here, else what the boards hold. */
  pickOf: (gameId: string) => string[]
  /** What the group picked here and not saved yet: «Nadie» is pressed only when it was picked. */
  picks: Record<string, string[] | undefined>
  canEdit: boolean
  nameOf: (p: HoleContest['eligible'][number]) => string
  onToggle: (c: HoleContest, pid: string | null) => void
}) {
  return (
    <>
      {p.contests.map((c) => {
        const chosen = p.pickOf(c.id)
        return (
          <div key={c.id} className={styles.contest} role="group" aria-label={c.label}>
            <span className={styles.contestTitle}>
              <strong>{S.contest.question[c.kind] ?? c.label}</strong>
              <span className="help">
                {c.label}
                {c.single ? '' : `, ${S.contest.many.toLowerCase()}`}
              </span>
            </span>
            <div className={styles.contestPicks}>
              {c.eligible.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  className={styles.pickup}
                  aria-pressed={chosen.includes(pl.id)}
                  disabled={!p.canEdit}
                  onClick={() => p.onToggle(c, pl.id)}
                >
                  {p.nameOf(pl)}
                </button>
              ))}
              <button
                type="button"
                className={styles.pickup}
                aria-pressed={p.picks[c.id] !== undefined && chosen.length === 0}
                disabled={!p.canEdit}
                onClick={() => p.onToggle(c, null)}
              >
                {S.contest.nobody}
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}

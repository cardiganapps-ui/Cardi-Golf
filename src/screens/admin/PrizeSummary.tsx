/**
 * The prize pool as a statement (§5.8): one line per enabled game, the
 * total, the entry pot, and whether they balance; then any place with a prize
 * that the field cannot fill (MONEY-09). Side pots and direct bets follow:
 * they pay what their entrants put in.
 */
import { t } from '../../i18n/es-MX'
import type { PrizeCheck } from '../../engine/settings/prizeCheck'
import type { Msg } from '../../engine/messages'
import { formatMoney } from '../../lib/money'
import { renderMsg } from '../../i18n/explain'
import styles from './PrizeSummary.module.css'

/** The money plan, in the currency being set up (the wizard's draft, or the tournament's settings). */
export function PrizeSummary({
  check,
  players,
  issues,
  currency: cur,
}: {
  check: PrizeCheck | null
  players: number
  issues?: string[]
  currency: string
}) {
  const A = t.admin.tournament
  const words = (m: Msg) => renderMsg(m, cur)
  return (
    <div className={styles.summary}>
      {issues && issues.length > 0 && (
        <p className={styles.invalid}>
          {A.invalid} {issues.join('; ')}
        </p>
      )}
      {check && (
        <>
          {check.lines.map((l) => (
            <div key={l.moduleId} className={styles.line}>
              <span>
                {words(l.label)} <span className={styles.detail}>{words(l.detail)}</span>
              </span>
              <span className={styles.amount}>{formatMoney(l.amount, cur)}</span>
            </div>
          ))}
          <div className={`${styles.line} ${styles.total}`}>
            <span>{t.money.prizes}</span>
            <span className={styles.amount}>{formatMoney(check.prizesTotal, cur)}</span>
          </div>
          <div className={styles.line}>
            <span>
              {t.money.entryFee}, {players} {t.live.players.toLowerCase()}
            </span>
            <span className={styles.amount}>{formatMoney(check.entryPot, cur)}</span>
          </div>
          <span className={`${styles.verdict} ${check.balanced ? '' : styles.verdictOff}`}>
            {check.balanced ? A.balanced : A.notBalanced(formatMoney(Math.abs(check.difference), cur))}
          </span>
          {/* MONEY-09: a balanced pool can still pay a place nobody can occupy. */}
          {check.unreachable.length > 0 && (
            <>
              <p className={`${styles.invalid} ${styles.unreachable}`}>{A.unreachableTitle}</p>
              {check.unreachable.map((u) => (
                <div key={u.id} className={styles.line}>
                  <span>
                    {u.label} <span className={styles.detail}>{words(u.detail)}</span>
                  </span>
                  <span className={`${styles.amount} ${styles.verdictOff}`}>{formatMoney(u.amount, cur)}</span>
                </div>
              ))}
            </>
          )}
          {check.sidePots.length > 0 && (
            <>
              <div className={`${styles.line} ${styles.total}`}>
                <span>{A.sidePots}</span>
                <span />
              </div>
              {check.sidePots.map((l) => (
                <div key={l.gameId} className={styles.line}>
                  <span>
                    {l.label} <span className={styles.detail}>{words(l.detail)}</span>
                  </span>
                  <span className={styles.amount}>{formatMoney(l.pot, cur)}</span>
                </div>
              ))}
            </>
          )}
          {check.bets.length > 0 && (
            <>
              <div className={`${styles.line} ${styles.total}`}>
                <span>{A.bets}</span>
                <span />
              </div>
              {check.bets.map((l) => (
                <div key={l.gameId} className={styles.line}>
                  <span>
                    {l.label} <span className={styles.detail}>{words(l.detail)}</span>
                  </span>
                  <span />
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

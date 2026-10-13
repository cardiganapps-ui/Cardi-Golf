/**
 * A handicap changed after they were fixed (UX-28): what it was then, what it
 * is now, and each change with the Comité's reason. The player's sheet shows
 * it to everyone; the Comité's own sheet shows it beside the handicap.
 */
import { hcpFromTo, t } from '../i18n/es-MX'
import type { HandicapChange } from '../engine/core/handicapLock'
import { localWhen } from '../lib/localWhen'
import styles from './HandicapChanges.module.css'

export function HandicapChanges({ change, timeZone }: { change: HandicapChange; timeZone: string }) {
  return (
    <div className={styles.box}>
      <p className={styles.line}>{t.player.hcpChanged(hcpFromTo(change.from, change.to))}</p>
      <ul className={styles.list}>
        {change.changes.map((c, i) => (
          <li key={`${c.at}-${i}`}>{t.player.hcpChange(localWhen(c.at, timeZone), c.reason)}</li>
        ))}
      </ul>
    </div>
  )
}

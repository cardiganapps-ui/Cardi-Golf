/**
 * What you are about to create, in plain lines: the tournament, then every
 * game with what it pays. The wizard used to create the tournament straight
 * off the money step, with no moment to look at the thing before it existed.
 *
 * It lives beside Setup.module.css, which holds its rules: it used to sit in
 * NewTournamentScreen and read them from Organizer.module.css, which has
 * none, so every label ran into its value («FormatoStableford», UX-03).
 */
import { t } from '../../../i18n/es-MX'
import type { PrizeCheck } from '../../../engine/settings/prizeCheck'
import type { TournamentSettings } from '../../../engine/settings/schema'
import { formatFor } from '../../../engine/formats'
import { formatMoney } from '../../../lib/money'
import { renderMsg } from '../../../i18n/explain'
import { reviewGameLines, type ReviewLine } from './reviewLines'
import styles from './Setup.module.css'

export function ReviewCard({ name, tagline, settings, players, check }: { name: string; tagline: string; settings: TournamentSettings; players: number; check: PrizeCheck | null }) {
  const cur = settings.currency
  const W = t.organizer.wizard
  const format = formatFor(settings)
  const basics: ReviewLine[] = [
    { key: 'name', label: W.name, value: name.trim() },
    // The tagline is its own line, not «name · tagline».
    ...(tagline.trim() ? [{ key: 'tagline', label: t.admin.tournament.tagline, value: tagline.trim() }] : []),
    { key: 'format', label: W.reviewFormat, value: `${format.defaultLabel}, ${renderMsg(format.figureLabel(settings), cur).toLowerCase()}` },
    { key: 'rounds', label: W.rounds, value: `${W.reviewDays(settings.rounds)}, ${W.reviewField(players)}` },
    { key: 'money', label: W.money, value: settings.entryFee > 0 ? W.reviewMoney(formatMoney(settings.entryFee, cur), formatMoney(settings.entryFee * players, cur)) : W.reviewNoMoney },
  ]
  return (
    <div className="stack">
      <span className="label">{W.review}</span>
      <Lines lines={basics} />
      <span className="label">{W.reviewGamesTitle}</span>
      <Lines lines={reviewGameLines(settings, check)} />
      <p className="help">{W.reviewHint}</p>
    </div>
  )
}

/** Label and value lines, as «Antes de crear» and the wizard's preview set them. */
export function Lines({ lines }: { lines: ReviewLine[] }) {
  return (
    <dl className={styles.review}>
      {lines.map((l) => (
        <div key={l.key} className={styles.reviewRow}>
          <dt className={styles.reviewKey}>{l.label}</dt>
          <dd className={styles.reviewValue}>
            {l.value}
            {l.detail && <span className={styles.reviewDetail}>{l.detail}</span>}
            {l.warn && <span className={styles.reviewWarn}>{l.warn}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

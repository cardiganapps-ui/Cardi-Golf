/**
 * VIS-19: on a laptop the wizard is two columns, the form and this: the event as it is typed (its name in the
 * event's serif over the accent rule, its tagline) and, on the second step, what each game pays (the third's
 * «Antes de crear» says it in the form itself). A phone does not draw it. It repeats what the form holds, so a
 * screen reader skips it.
 */
import { t } from '../../../i18n/es-MX'
import { EventName } from '../../../components/primitives'
import type { PrizeCheck } from '../../../engine/settings/prizeCheck'
import type { TournamentSettings } from '../../../engine/settings/schema'
import { reviewGameLines } from './reviewLines'
import { Lines } from './ReviewCard'
import styles from './Setup.module.css'
import { useWide } from '../../../lib/useWide'

export function WizardPreview({
  name,
  tagline,
  settings,
  check,
  step,
}: {
  name: string
  tagline: string
  settings: TournamentSettings
  check: PrizeCheck | null
  step: number
}) {
  const W = t.organizer.wizard
  if (!useWide()) return null
  return (
    <aside className={styles.preview} data-wizard-preview aria-hidden="true">
      <span className="label">{W.previewTitle}</span>
      <EventName name={name.trim() || W.previewName} tagline={tagline.trim() || undefined} />
      {step === 2 && (
        <>
          <span className="label">{W.reviewGamesTitle}</span>
          <Lines lines={reviewGameLines(settings, check)} />
        </>
      )}
    </aside>
  )
}

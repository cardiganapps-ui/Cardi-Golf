/**
 * "Avisos en este teléfono": turns web push on or off for this device. The
 * permission prompt only ever comes from the tap on the button. Its state and
 * taps are the tournament's switch's too (usePushSwitch).
 */
import { useId } from 'react'
import { t } from '../../i18n/es-MX'
import { NoticeNote } from '../../components/LegalLinks'
import styles from './Profile.module.css'
import { pushNote, usePushSwitch } from './usePushSwitch'

const P = t.push

export function PushToggle({ compact = false }: { compact?: boolean }) {
  const { state, busy, enable, disable } = usePushSwitch(null)
  const noteId = useId()

  // Nothing to offer: say nothing in compact places, explain in settings.
  if (state === null || (compact && (state === 'unsupported' || state === 'on' || state === 'denied'))) return null

  return (
    <div className={compact ? styles.ask : styles.section}>
      {!compact && <span className="label">{P.title}</span>}
      <span className={styles.help}>{pushNote(state, P.hint)}</span>
      {/* Before the tap that stores this browser's push address (TRUST-05), and heard with the button. */}
      {state === 'off' && <NoticeNote note={t.legal.pushNote} id={noteId} />}
      {(state === 'off' || state === 'on') && (
        <div className={styles.askActions}>
          {state === 'off' ? (
            <button
              className="btn btn--primary btn--sm"
              type="button"
              disabled={busy}
              onClick={() => void enable()}
              aria-describedby={noteId}
            >
              {P.enable}
            </button>
          ) : (
            <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void disable()}>
              {P.disable}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

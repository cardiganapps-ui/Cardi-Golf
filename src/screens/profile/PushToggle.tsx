/**
 * "Avisos en este teléfono": turns web push on or off for this device. The
 * permission prompt only ever comes from the tap on the button.
 */
import { useEffect, useId, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/ui'
import { NoticeNote } from '../../components/LegalLinks'
import { disablePush, enablePush, pushState, type PushState } from '../../data/push'
import styles from './Profile.module.css'
import { humanError } from '../../lib/humanError'

const P = t.push

export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const noteId = useId()

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  // Nothing to offer: say nothing in compact places, explain in settings.
  if (state === null || (compact && (state === 'unsupported' || state === 'on' || state === 'denied'))) return null

  async function run(fn: () => Promise<PushState>, done: string) {
    setBusy(true)
    try {
      const next = await fn()
      setState(next)
      if (next === 'on' || next === 'off') toast(done)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  const note = state === 'on' ? P.on : state === 'denied' ? P.denied : state === 'needsInstall' ? P.needsInstall : state === 'unsupported' ? P.unsupported : P.hint
  return (
    <div className={compact ? styles.ask : styles.section}>
      {!compact && <span className="label">{P.title}</span>}
      <span className={styles.help}>{note}</span>
      {/* Before the tap that stores this browser's push address (TRUST-05), and heard with the button. */}
      {state === 'off' && <NoticeNote note={t.legal.pushNote} id={noteId} />}
      {(state === 'off' || state === 'on') && (
        <div className={styles.askActions}>
          {state === 'off' ? (
            <button className="btn btn--primary btn--sm" type="button" disabled={busy} onClick={() => void run(enablePush, P.enabled)} aria-describedby={noteId}>
              {P.enable}
            </button>
          ) : (
            <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void run(disablePush, P.disabled)}>
              {P.disable}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

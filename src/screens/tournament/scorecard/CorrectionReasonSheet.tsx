import { memo } from 'react'
import { Sheet } from '../../../components/ui'
import { t } from '../../../i18n/es-MX'
import { Button } from '../../../components/primitives'

const S = t.card

/**
 * The Comité's reason for a correction on a signed card (§7): asked before the hole saves, and written with it
 * through the server (`admin_save_hole`). Three characters at least.
 */
export const CorrectionReasonSheet = memo(function CorrectionReasonSheet(p: {
  open: boolean
  reason: string
  onReason: (reason: string) => void
  busy: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Sheet open={p.open} onClose={p.onClose} title={S.signedReasonTitle}>
      <div className="stack">
        <p className="help">{S.signedReasonHint}</p>
        <input
          className="input"
          value={p.reason}
          onChange={(e) => p.onReason(e.target.value)}
          placeholder={t.admin.scores.reason}
          aria-label={t.admin.scores.reason}
          autoFocus
        />
        <div className="row">
          <Button onClick={p.onClose}>{t.common.cancel}</Button>
          <Button variant="primary" className="grow" disabled={p.busy || p.reason.trim().length < 3} onClick={p.onSave}>
            {p.busy ? t.common.saving : S.save}
          </Button>
        </div>
      </div>
    </Sheet>
  )
})

/**
 * A confirmation that needs a reason. Every platform action that changes
 * something it does not own (unlock a protected tournament, take protection
 * off, later: block an account) is logged with why, so the button stays off
 * until there is one.
 */
import { useEffect, useState } from 'react'
import { t } from '../i18n/es-MX'
import { ConfirmSheet } from './ConfirmSheet'
import { Field, Input } from './primitives'
import { humanError } from '../lib/humanError'
import { reasonLength, trimReason } from '../lib/reason'

const MIN = 3

export function ReasonSheet({
  open,
  title,
  body,
  confirmLabel,
  danger,
  initialReason = '',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  /** What the field holds when it opens (a reason the screen can suggest). */
  initialReason?: string
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setReason(initialReason)
      setError(null)
    }
  }, [open, initialReason])
  // As the server reads it: trimmed of every whitespace, counted in characters (two golfers are two, not four).
  const why = trimReason(reason)
  const ok = reasonLength(why) >= MIN
  async function confirm() {
    if (!ok) {
      setError(t.platform.reasonPlaceholder)
      return
    }
    setBusy(true)
    try {
      await onConfirm(why)
      onClose()
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmSheet open={open} title={title} body={body} confirmLabel={confirmLabel} danger={danger} busy={busy} onConfirm={() => void confirm()} onClose={onClose}>
      <Field label={t.platform.reason} error={error}>
        <Input value={reason} maxLength={200} placeholder={t.platform.reasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ConfirmSheet>
  )
}

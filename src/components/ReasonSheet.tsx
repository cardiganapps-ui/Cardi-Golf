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

const MIN = 3

export function ReasonSheet({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open])
  const ok = reason.trim().length >= MIN
  async function confirm() {
    if (!ok) {
      setError(t.platform.reasonPlaceholder)
      return
    }
    setBusy(true)
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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

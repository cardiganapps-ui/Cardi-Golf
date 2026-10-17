/**
 * One question, two buttons. For the mutations that used to fire on a single
 * tap (finish a round, replace groups, new join code, delete).
 */
import type { ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { Sheet } from './ui'
import styles from './ConfirmSheet.module.css'
import { Button } from './primitives'
import { buttonClass } from './buttonClass'

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={styles.confirm}>
        {body && <p className={styles.body}>{body}</p>}
        {children}
        <div className={styles.actions}>
          <Button onClick={onClose} disabled={busy}>
            {cancelLabel ?? t.common.cancel}
          </Button>
          <button
            className={buttonClass({ variant: danger ? 'danger' : 'primary' })}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t.common.saving : (confirmLabel ?? t.common.confirm)}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

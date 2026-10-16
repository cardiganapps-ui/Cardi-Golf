/**
 * Opening a tournament, an account or a crew from the panel is logged with
 * the admin's reason (0068, TRUST-22), and who it is about sees it. The
 * server asks for one (PV001) unless he gave one for that target in the last
 * two hours, so a reload or a change made here opens again without a word.
 * The detail screens load through `useAdminView` (its own file); while the
 * server asks, they show `ViewReasonForm` in place of the detail.
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Field, Input } from '../../components/primitives'
import { reasonLength, trimReason } from '../../lib/reason'
import s from './Platform.module.css'

const V = t.platform.view
const MIN = 3

/** «¿Por qué lo abres?»: the reason that goes on the record before the detail opens. */
export function ViewReasonForm({ kind, onOpen }: { kind: keyof typeof V.body; onOpen: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const why = trimReason(reason)
  const ok = reasonLength(why) >= MIN
  return (
    <form
      className={s.section}
      onSubmit={(e) => {
        e.preventDefault()
        if (!ok || busy) return
        setBusy(true)
        void onOpen(why).finally(() => setBusy(false))
      }}
    >
      <h2>{V.title}</h2>
      <p className={s.help}>{V.body[kind]}</p>
      <Field label={t.platform.reason}>
        <Input value={reason} maxLength={200} placeholder={V.placeholder} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className={s.actions}>
        <button className="btn btn--primary btn--sm" type="submit" disabled={!ok || busy}>
          {V.open}
        </button>
      </div>
    </form>
  )
}

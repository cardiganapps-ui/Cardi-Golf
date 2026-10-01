/**
 * What a signed-in person sees when Polo cannot confirm their session at
 * startup — instead of the blank white page that used to be there. Two ways
 * out: try again, or drop the cached app and reload (the session and any
 * unsent scores survive either).
 */
import { useState } from 'react'
import { t } from '../i18n/es-MX'
import { buildLabel } from '../lib/build'
import { retryAuth } from '../data/auth'
import { resetApp } from '../lib/resetApp'
import { Wordmark } from './Wordmark'
import styles from './BootProblem.module.css'

export function BootProblem({ kind }: { kind: 'timeout' | 'error' | 'crash'; detail?: string }) {
  const [busy, setBusy] = useState(false)
  const B = t.boot
  return (
    <main className={styles.wrap} role="alert">
      <Wordmark size="lg" />
      <h1 className={styles.title}>{kind === 'crash' ? B.crashTitle : B.slowTitle}</h1>
      <p className={styles.body}>{kind === 'crash' ? B.crashBody : B.slowBody}</p>
      <div className={styles.actions}>
        {kind !== 'crash' && (
          <button
            className="btn btn--primary btn--block"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void retryAuth().finally(() => setBusy(false))
            }}
          >
            {busy ? B.retrying : B.retry}
          </button>
        )}
        <button className={`btn btn--block ${kind === 'crash' ? 'btn--primary' : 'btn--secondary'}`} type="button" onClick={() => void resetApp()}>
          {B.reset}
        </button>
      </div>
      <p className={styles.hint}>{B.resetHint}</p>
      <p className={styles.version}>{B.version(buildLabel())}</p>
    </main>
  )
}

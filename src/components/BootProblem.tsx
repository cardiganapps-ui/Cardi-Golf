/**
 * What a signed-in person sees when Polo cannot confirm their session at
 * startup — instead of the blank white page that used to be there. Two ways
 * out: try again, or drop the cached app and reload (the session and any
 * unsent scores survive either). A third when the phone has the last
 * tournament's boards saved: open them, which needs no session (REL-03).
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { t } from '../i18n/es-MX'
import { buildLabel } from '../lib/build'
import { retryAuth } from '../data/auth'
import { resetApp } from '../lib/resetApp'
import { Wordmark } from './Wordmark'
import styles from './BootProblem.module.css'

/** `saved`: the slug of a tournament whose boards this phone saved (home passes it; the crash screens, outside the router, never do). */
export function BootProblem({ kind, saved }: { kind: 'timeout' | 'error' | 'crash'; saved?: string }) {
  const [busy, setBusy] = useState(false)
  const B = t.boot
  return (
    <main className={styles.wrap} role="alert">
      <Wordmark size="lg" />
      <h1 className={styles.title}>{kind === 'crash' ? B.crashTitle : B.slowTitle}</h1>
      <p className={styles.body}>{kind === 'crash' ? B.crashBody : B.slowBody}</p>
      <div className={styles.actions}>
        {saved && (
          <Link className="btn btn--primary btn--block" to={`/t/${saved}`}>
            {B.openSaved}
          </Link>
        )}
        {kind !== 'crash' && (
          <button
            className={`btn btn--block ${saved ? 'btn--secondary' : 'btn--primary'}`}
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

/**
 * The boards, the money and the Comité's setup only when this build can read
 * the tournament's settings (ARCH-04). A row a newer build wrote used to be
 * computed on the defaults (100% handicap, no side games, $0 in prizes)
 * without a word; now the screen says to update, with the button that does.
 */
import { useContext, useState, type ReactNode } from 'react'
import { applyUpdate } from '../../data/appUpdate'
import { useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from './TournamentGate'
import styles from './SettingsGuard.module.css'

/** `money`: a screen that is money (Dinero, the Ceremonia) also waits while a side game this build doesn't know may move some. */
export function SettingsGuard({ children, money = false }: { children: ReactNode; money?: boolean }) {
  const error = useTournament((s) => s.data?.settingsError ?? null)
  const unknown = useTournament((s) => (money ? s.data?.state.flags.moneyUnknown : undefined))
  if (error != null) return <OutdatedNotice detail={error} />
  if (unknown?.length) return <OutdatedNotice body={t.outdated.money(unknown)} />
  return <>{children}</>
}

/** «Actualiza la app», why, and the button that updates; what it doesn't recognize only for the Comité. */
export function OutdatedNotice({ detail, body = t.outdated.body }: { detail?: string | null; body?: string }) {
  const ctx = useContext(TournamentContext)
  const comite = !!ctx && !ctx.spectator && (ctx.me.isOrganizer || ctx.me.isAdmin)
  const [busy, setBusy] = useState(false)
  return (
    <section className={`card card--alert ${styles.notice}`} aria-labelledby="outdated-title">
      <h1 id="outdated-title" className={styles.title}>
        {t.outdated.title}
      </h1>
      <p>{body}</p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => {
          setBusy(true)
          void applyUpdate().finally(() => setBusy(false))
        }}
      >
        {busy ? t.sync.refreshing : t.sync.update}
      </button>
      {detail && comite && <p className="small">{t.outdated.detail(detail)}</p>}
    </section>
  )
}

/**
 * «Admin de Polo»: shown inside a tournament when the platform admin is
 * visiting one he does not belong to (me.via === 'platform'). It says so,
 * links back to the panel, and — on a Protegido tournament — is where he
 * unlocks it for 30 minutes with a reason, or locks it again early.
 *
 * The unlock expires on the server; the banner only refreshes the gate when
 * the clock runs out, so the screen matches what the server will allow.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/ui'
import { IconLock, IconShield } from '../../components/icons'
import { ReasonSheet } from '../../components/ReasonSheet'
import { usePlatformApi } from '../../data/platform'
import { useTournamentCtx } from './TournamentGate'
import styles from './PlatformBanner.module.css'
import { humanError } from '../../lib/humanError'

const P = t.platform
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export function PlatformBanner() {
  const { me, tournamentId, refresh } = useTournamentCtx()
  const api = usePlatformApi()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const until = me.unlockedUntil ?? null

  // When the unlock runs out, ask the server again: the Comité closes itself.
  useEffect(() => {
    if (!until) return
    const ms = new Date(until).getTime() - Date.now()
    const id = window.setTimeout(() => void refresh(), Math.max(ms, 0) + 1000)
    return () => window.clearTimeout(id)
  }, [until, refresh])

  if (me.via !== 'platform') return null
  const locked = !!me.protected && !until

  async function relock() {
    setBusy(true)
    try {
      await api.relock(tournamentId)
      await refresh()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${styles.banner} ${locked ? styles.locked : ''}`} role="status">
      <span className={styles.icon} aria-hidden="true">
        {locked ? <IconLock size={18} /> : <IconShield size={18} />}
      </span>
      <span className={styles.text}>
        <strong>{P.banner}</strong>
        <span className={styles.sub}>{locked ? P.bannerProtected : until ? P.bannerUnlocked(clock(until)) : P.bannerBody}</span>
      </span>
      <span className={styles.actions}>
        {locked && (
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => setAsking(true)}>
            {P.unlock}
          </button>
        )}
        {until && (
          <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void relock()}>
            {P.relock}
          </button>
        )}
        <Link className="btn btn--ghost btn--sm" to={`/admin/torneos/${tournamentId}`}>
          {P.bannerPanel}
        </Link>
      </span>
      <ReasonSheet
        open={asking}
        title={P.unlockTitle}
        body={P.unlockBody}
        confirmLabel={P.unlock}
        onClose={() => setAsking(false)}
        onConfirm={async (reason) => {
          await api.unlock(tournamentId, reason)
          await refresh()
        }}
      />
    </div>
  )
}

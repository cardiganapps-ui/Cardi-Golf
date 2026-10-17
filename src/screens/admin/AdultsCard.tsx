/**
 * Comité › Torneo › Dinero: the Comité's word that every player is 18 or
 * older (0070, TRUST-13). The wizard asks it before a tournament with money
 * exists; one made before, or whose money came later, says here that it is
 * missing. Read from the server when the tab opens; a database without 0070
 * shows nothing.
 */
import { useCallback, useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Toggle } from '../../components/ui'
import { toast } from '../../components/toast'
import { adultsConfirmedAt, confirmAdults } from '../../data/myData'
import { moneyInPlay } from '../../engine/settings/moneyInPlay'
import type { TournamentSettings } from '../../engine/settings/schema'
import { humanError } from '../../lib/humanError'
import { localWhen } from '../../lib/localWhen'
import a from './Admin.module.css'

const M = t.money.adults

export function AdultsCard({
  tournamentId,
  settings,
  timeZone,
}: {
  tournamentId: string
  settings: TournamentSettings | null
  timeZone: string
}) {
  const [at, setAt] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const read = useCallback(() => {
    adultsConfirmedAt(tournamentId).then(setAt, () => setAt(undefined))
  }, [tournamentId])
  useEffect(read, [read])
  if (at === undefined) return null
  const missing = at == null && !!settings && moneyInPlay(settings)

  async function set(on: boolean) {
    setBusy(true)
    try {
      setAt(await confirmAdults(tournamentId, on))
    } catch (e) {
      toast(humanError(e))
      read()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={a.section} aria-labelledby="adults-title">
      <strong id="adults-title">{M.title}</strong>
      {missing && <p className={a.error}>{M.missing}</p>}
      {at && <p className={a.help}>{M.confirmed(localWhen(at, timeZone))}</p>}
      <Toggle label={M.check} hint={M.hint} checked={at != null} onChange={(on) => !busy && void set(on)} />
    </section>
  )
}

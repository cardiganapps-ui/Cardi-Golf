/**
 * The state and the two taps of a push switch: the account's («Avisos en este
 * teléfono», PushToggle) and the tournament's for the player a phone holds by
 * PIN («Avisos del torneo», src/screens/tournament/TournamentPush.tsx). The
 * permission prompt only ever comes from the tap on «Activar avisos».
 */
import { useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/toast'
import {
  ACCOUNT,
  deniedHelp,
  disablePush,
  enablePush,
  pushState,
  unsupportedHelp,
  usePushFixture,
  type PushState,
} from '../../data/push'
import { humanError } from '../../lib/humanError'

const P = t.push

/**
 * This phone's push for the account (`tournamentId` null) or for the player it holds by PIN in that
 * tournament: the state as the browser and the server have it, and the two taps.
 */
export function usePushSwitch(tournamentId: string | null) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const target = tournamentId ? ({ kind: 'player', tournamentId } as const) : ACCOUNT
  // The design fixtures set it after the screen is up (src/dev/FixtureGate): read again when they do.
  const fixture = usePushFixture((s) => s.state)

  useEffect(() => {
    let live = true
    pushState(tournamentId ? { kind: 'player', tournamentId } : ACCOUNT)
      .then((s) => live && setState(s))
      .catch(() => live && setState('unsupported'))
    return () => {
      live = false
    }
  }, [tournamentId, fixture])

  async function run(fn: () => Promise<PushState>, done: string) {
    setBusy(true)
    try {
      const next = await fn()
      setState(next)
      if (next === 'on' || next === 'off') toast(done)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  return {
    state,
    busy,
    enable: () => run(() => enablePush(target), P.enabled),
    disable: () => run(() => disablePush(target), P.disabled),
  }
}

/** The line under the title: what they bring, or why this phone can't have them, said for this phone. */
export function pushNote(state: PushState, hint: string): string {
  if (state === 'on') return P.on
  if (state === 'denied') return deniedHelp()
  if (state === 'needsInstall') return P.needsInstall
  if (state === 'unsupported') return unsupportedHelp()
  return hint
}

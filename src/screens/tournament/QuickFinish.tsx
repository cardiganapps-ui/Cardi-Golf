/**
 * On a Ronda rápida, the organizer closes it from En vivo: finish the round
 * and the tournament and publish to the players' profiles in one tap.
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/ui'
import { useCloseGate } from '../../components/CloseGate'
import { finishQuickRound, finishQuickRounds } from '../../data/quick'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import { humanError } from '../../lib/humanError'

const Q = t.quick

export function QuickFinish() {
  const data = useTournament((s) => s.data)
  const { me, tournamentId } = useTournamentCtx()
  const [busy, setBusy] = useState(false)
  // «Cerrar torneo» (MONEY-05): the round closes only once nothing is left open; the check reads it as finished.
  const closeGate = useCloseGate(tournamentId)
  if (!data) return null
  const { snapshot, state } = data
  if (!snapshot.tournament.quick || !me.isOrganizer || snapshot.tournament.status !== 'live') return null

  const live = snapshot.rounds.filter((r) => r.status === 'live')
  const missing = new Set<string>()
  for (const r of live) {
    for (const p of snapshot.players) if ((state.core.rounds[r.id]?.[p.id]?.thru ?? 0) < r.holes) missing.add(p.id)
  }

  async function finish() {
    setBusy(true)
    try {
      const r = await finishQuickRound(tournamentId)
      toast(Q.finished(r.players))
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <strong>{Q.finishTitle}</strong>
      <p className="help">{missing.size > 0 ? `${Q.finishMissing(missing.size)} ${Q.finishHint}` : Q.finishHint}</p>
      <button
        className={missing.size > 0 ? 'btn btn--secondary' : 'btn btn--primary'}
        type="button"
        disabled={busy || closeGate.checking}
        onClick={() =>
          void closeGate.guard(
            {
              finishLiveRounds: true,
              alwaysConfirm: true,
              title: Q.finishTitle,
              body: `${missing.size > 0 ? `${Q.finishMissing(missing.size)} ${Q.finishConfirm}` : Q.finishConfirm} ${t.admin.rounds.phonesBeforeFinish}`,
              confirmLabel: Q.finishTitle,
              moneyFirst: () => finishQuickRounds(tournamentId),
            },
            finish,
          )
        }
      >
        {Q.finishTitle}
      </button>
      {closeGate.sheet}
    </div>
  )
}

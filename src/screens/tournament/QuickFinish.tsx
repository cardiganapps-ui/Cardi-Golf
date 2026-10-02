/**
 * On a Ronda rápida, the organizer closes it from En vivo: finish the round
 * and the tournament and publish to the players' profiles in one tap.
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/ui'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { finishQuickRound } from '../../data/quick'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import { humanError } from '../../lib/humanError'

const Q = t.quick

export function QuickFinish() {
  const data = useTournament((s) => s.data)
  const { me, tournamentId } = useTournamentCtx()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
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
      setAsk(false)
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
      <button className={missing.size > 0 ? 'btn btn--secondary' : 'btn btn--primary'} type="button" disabled={busy} onClick={() => setAsk(true)}>
        {Q.finishTitle}
      </button>
      <ConfirmSheet
        open={ask}
        title={Q.finishTitle}
        body={`${missing.size > 0 ? `${Q.finishMissing(missing.size)} ${Q.finishConfirm}` : Q.finishConfirm} ${t.admin.rounds.phonesBeforeFinish}`}
        busy={busy}
        confirmLabel={Q.finishTitle}
        onConfirm={() => void finish()}
        onClose={() => setAsk(false)}
      />
    </div>
  )
}

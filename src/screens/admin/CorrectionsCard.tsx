/**
 * Comité › Jugadores: what players asked to correct about themselves, from
 * their phones (TRUST-16, 0070). The Comité fixes it in the player's sheet
 * and marks it «Hecho»; marking it is in Historial. Shows nothing while none
 * is open, and on a database without 0070.
 */
import { useCallback, useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/toast'
import { correctionRequests, resolveCorrection, type CorrectionRequest } from '../../data/myData'
import { useTournament } from '../../data/tournamentStore'
import { humanError } from '../../lib/humanError'
import { relTime } from '../../lib/relTime'
import a from './Admin.module.css'

const M = t.myData

export function CorrectionsCard({ tournamentId }: { tournamentId: string }) {
  const players = useTournament((s) => s.data?.snapshot.players)
  const [rows, setRows] = useState<CorrectionRequest[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const read = useCallback(() => {
    correctionRequests(tournamentId).then(setRows, () => setRows(null))
  }, [tournamentId])
  useEffect(read, [read])
  const open = (rows ?? []).filter((r) => !r.doneAt)
  if (open.length === 0) return null
  const name = (id: string) => players?.find((p) => p.id === id)?.displayName ?? '?'

  async function done(id: number) {
    setBusy(id)
    try {
      await resolveCorrection(id)
      read()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={a.section} aria-labelledby="corrections-title">
      <strong id="corrections-title">{M.requests(open.length)}</strong>
      <p className={a.help}>{M.requestsHint}</p>
      <div className={a.rows}>
        {open.map((r) => (
          <div key={r.id} className={a.row}>
            <span className={a.rowText}>
              <span className={a.rowTitle}>{r.text}</span>
              <span className={a.rowSub}>{M.requestLine(name(r.playerId), relTime(r.at))}</span>
            </span>
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              disabled={busy === r.id}
              onClick={() => void done(r.id)}
            >
              {M.done}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

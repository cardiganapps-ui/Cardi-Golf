/**
 * Comité › Torneo: which crew the tournament counts for (0018). Lists the
 * organizer's own crews; the server refuses a crew they're not in.
 */
import { useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Field, toast } from '../../components/ui'
import { myCrews, setTournamentCrew, type MyCrew } from '../../data/crews'
import { useTournament } from '../../data/tournamentStore'
import { humanError } from '../../lib/humanError'

export function CrewField({ tournamentId }: { tournamentId: string }) {
  const crewId = useTournament((s) => s.data?.snapshot.tournament.crewId ?? null)
  const patch = useTournament((s) => s.patch)
  const [crews, setCrews] = useState<MyCrew[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    myCrews()
      .then(setCrews)
      .catch(() => setCrews([]))
  }, [])

  if (!crews || (crews.length === 0 && !crewId)) return null
  const foreign = crewId && !crews.some((c) => c.id === crewId)

  async function change(id: string) {
    setBusy(true)
    try {
      await setTournamentCrew(tournamentId, id || null)
      patch((s) => (s.tournament.crewId = id || null))
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Field label={t.crews.crewField} hint={t.crews.crewHint}>
      <select className="select" value={crewId ?? ''} disabled={busy} onChange={(e) => void change(e.target.value)}>
        <option value="">{t.crews.crewNone}</option>
        {foreign && (
          <option value={crewId} disabled>
            {t.crews.title}
          </option>
        )}
        {crews.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/**
 * Datos (§13): export everything as JSON and CSV, restore from a JSON backup
 * of this tournament, duplicate the tournament (settings, course, players; no
 * scores) and the printable fallback scorecards.
 */
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Field, toast } from '../../components/ui'
import { duplicateTournament } from '../../data/api'
import { downloadText, exportBackup, restoreBackup, toCsv, type Backup } from '../../data/backup'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'

const D = t.admin.data

export function AdminData() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [dupName, setDupName] = useState(`${data.snapshot.tournament.name} (copia)`)
  const fileRef = useRef<HTMLInputElement>(null)
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(e instanceof Error && e.message === 'wrong-tournament' ? D.wrongTournament : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const { snapshot, state } = data
    const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.displayName ?? id
    const scores = toCsv(
      ['dia', 'jugador', 'hoyo', 'par', 'si', 'ventaja', 'golpes', 'putts', 'levanto', 'puntos'],
      state.core.roundIds.flatMap((rid) => {
        const round = snapshot.rounds.find((r) => r.id === rid)!
        return Object.values(state.core.rounds[rid] ?? {}).flatMap((pr) =>
          pr.holes.filter((h) => h.played).map((h) => [round.number, nameOf(pr.playerId), h.hole, h.par, h.strokeIndex, h.strokesReceived, h.gross, h.putts, h.pickedUp ? 1 : 0, h.points]),
        )
      }),
    )
    downloadText(`${slug}-scores-${stamp}.csv`, scores, 'text/csv')
    const rows = state.modules.individual?.rows ?? []
    const standings = toCsv(
      ['pos', 'jugador', 'categoria', ...state.core.roundIds.map((_, i) => `dia${i + 1}`), 'total', 'premios', 'pago', 'recibe', 'neto'],
      rows.map((r) => {
        const p = snapshot.players.find((x) => x.id === r.playerId)
        const m = state.money.people[r.playerId]
        return [r.label, p?.fullName ?? r.playerId, p?.tier ?? '', ...r.perRound, r.total, m?.prizesTotal ?? 0, m?.paid ?? 0, m?.receives ?? 0, m?.net ?? 0]
      }),
    )
    downloadText(`${slug}-resultados-${stamp}.csv`, standings, 'text/csv')
  }

  async function onRestore(file: File) {
    const text = await file.text()
    let backup: Backup
    try {
      backup = JSON.parse(text) as Backup
    } catch {
      toast(D.badFile)
      return
    }
    if (!confirm(D.restoreConfirm(new Date(backup.exportedAt ?? 0).toLocaleString('es-MX')))) return
    await run(async () => {
      await restoreBackup(tournamentId, backup)
      await reload()
      toast(D.restored)
    })
  }

  return (
    <div className="stack stack--lg">
      <section className="card stack">
        <span className="label">{D.export}</span>
        <p className="help">{D.exportHint}</p>
        <div className="row row--wrap">
          <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void run(async () => downloadText(`${slug}-respaldo-${stamp}.json`, JSON.stringify(await exportBackup(tournamentId), null, 2)))}>
            {D.exportJson}
          </button>
          <button className="btn btn--secondary" type="button" disabled={busy} onClick={exportCsv}>
            {D.exportCsv}
          </button>
        </div>
      </section>

      <section className="card stack">
        <span className="label">{D.restore}</span>
        <p className="help">{D.restoreHint}</p>
        <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          {D.restoreButton}
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void onRestore(e.target.files[0])} />
      </section>

      <section className="card stack">
        <span className="label">{D.print}</span>
        <p className="help">{D.printHint}</p>
        <Link className="btn btn--secondary" to={`/t/${slug}/imprimir`}>
          {D.printButton}
        </Link>
      </section>

      <section className="card stack">
        <span className="label">{D.duplicate}</span>
        <p className="help">{D.duplicateHint}</p>
        <Field label={D.duplicateName}>
          <input className="input" value={dupName} onChange={(e) => setDupName(e.target.value)} />
        </Field>
        <button
          className="btn btn--secondary"
          type="button"
          disabled={busy || !dupName.trim()}
          onClick={() =>
            void run(async () => {
              const created = await duplicateTournament(tournamentId, dupName.trim())
              toast(D.duplicated)
              navigate(`/t/${created.slug}/admin`)
            })
          }
        >
          {D.duplicateButton}
        </button>
      </section>
    </div>
  )
}

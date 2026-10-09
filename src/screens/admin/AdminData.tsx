/**
 * Datos (§13): export everything as JSON and CSV, restore from a JSON backup
 * of this tournament, duplicate the tournament (settings, course, players; no
 * scores) and the printable fallback scorecards.
 */
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Field, toast } from '../../components/ui'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { duplicateTournament } from '../../data/api'
import { downloadText, exportBackup, restoreBackup, toCsv, type Backup } from '../../data/backup'
import { useTournament } from '../../data/tournamentStore'
import { publishFromStore } from '../../data/publish'
import { useCloseGate } from '../../components/CloseGate'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { humanError } from '../../lib/humanError'

const D = t.admin.data

export function AdminData() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [dupName, setDupName] = useState(`${data.snapshot.tournament.name} ${t.common.copySuffix}`)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<Backup | null>(null)
  const closeGate = useCloseGate(tournamentId)
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(humanError(e))
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
    downloadText(`${slug}-tarjetas-${stamp}.csv`, scores, 'text/csv')
    const rows = state.modules.individual?.rows ?? []
    // One line per player: in a team format the row is the team's, so each member gets its place and figures, and his own money (STRAT-03).
    const byTeam = rows.some((r) => r.entrant.isTeam)
    const standings = toCsv(
      ['pos', 'jugador', ...(byTeam ? ['equipo'] : []), 'categoria', ...state.core.roundIds.map((_, i) => `dia${i + 1}`), 'total', 'premios', 'pago', 'recibe', 'neto'],
      rows.flatMap((r) =>
        r.entrant.playerIds.map((id) => {
          const p = snapshot.players.find((x) => x.id === id)
          const m = state.money.people[id]
          return [r.label, p?.fullName ?? id, ...(byTeam ? [r.entrant.name] : []), p?.tier ?? '', ...r.perRound.map((f) => f.value), r.total, m?.prizesTotal ?? 0, m?.paid ?? 0, m?.receives ?? 0, m?.net ?? 0]
        }),
      ),
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
    if (backup.version !== 1 || backup.tournamentId !== tournamentId) {
      toast(D.wrongTournament)
      return
    }
    setPendingRestore(backup)
  }

  async function doRestore() {
    const backup = pendingRestore
    if (!backup) return
    await run(async () => {
      const n = await restoreBackup(tournamentId, backup)
      await reload()
      setPendingRestore(null)
      toast(D.restoredCount(n.players, n.rounds, n.scores))
    })
  }

  const finished = data.snapshot.tournament.status === 'finished'
  return (
    <div className="stack stack--lg">
      <section className="card stack">
        <span className="label">{D.publish}</span>
        <p className="help">{finished ? D.publishHint : D.publishWaiting}</p>
        <div className="row row--wrap">
          <button
            className="btn btn--secondary"
            type="button"
            disabled={busy || !finished || closeGate.checking}
            onClick={() =>
              // «Cerrar torneo» (MONEY-05): results are published only once nothing is left open.
              void closeGate.guard({ confirmLabel: D.publishButton }, () =>
                run(async () => {
                  const r = await publishFromStore(tournamentId)
                  toast(t.admin.tournament.published(r.players))
                }),
              )
            }
          >
            {D.publishButton}
          </button>
        </div>
        {closeGate.sheet}
      </section>
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
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onRestore(f)
          }}
        />
      </section>
      <ConfirmSheet
        open={!!pendingRestore}
        title={D.restore}
        body={pendingRestore ? D.restoreConfirm(new Date(pendingRestore.exportedAt ?? 0).toLocaleString('es-MX')) : ''}
        danger
        busy={busy}
        confirmLabel={D.restoreButton}
        onConfirm={() => void doRestore()}
        onClose={() => setPendingRestore(null)}
      />

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

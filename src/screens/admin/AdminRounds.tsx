import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Field, Sheet, toast } from '../../components/ui'
import { deleteRound, setRoundStatus, setRoundTee, updateTournament, upsertRound } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import type { Round } from '../../engine/types'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { useCourses } from './useCourses'

const R = t.admin.rounds

export function AdminRounds() {
  const { tournamentId } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const reload = useTournament((s) => s.reload)
  const patch = useTournament((s) => s.patch)
  const { courses } = useCourses()
  const rounds = data!.snapshot.rounds
  const players = data!.snapshot.players
  const [editing, setEditing] = useState<{ id?: string; number: number; date: string; course_id: string; holes: 9 | 18 } | null>(null)
  const [teesFor, setTeesFor] = useState<Round | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!editing) return
    setBusy(true)
    try {
      await upsertRound(tournamentId, { id: editing.id, number: editing.number, date: editing.date || null, course_id: editing.course_id || null, holes: editing.holes })
      await reload()
      setEditing(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function status(r: Round, s: Round['status']) {
    try {
      await setRoundStatus(r.id, s)
      if (s === 'live') {
        await updateTournament(tournamentId, { current_round_id: r.id, status: 'live' })
      }
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(r: Round) {
    if (!confirm(t.common.confirmDelete)) return
    try {
      await deleteRound(r.id)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const courseTees = (courseId: string | null) => data!.snapshot.courses.find((c) => c.id === courseId)?.tees ?? []

  return (
    <div className="stack">
      <div className="row row--between">
        <h2>{t.admin.sections.rounds}</h2>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setEditing({ number: rounds.length + 1, date: '', course_id: courses[0]?.id ?? '', holes: 18 })}>
          {R.add}
        </button>
      </div>
      {rounds.length === 0 && <p className="muted">{R.empty}</p>}
      {rounds.map((r) => {
        const course = courses.find((c) => c.id === r.courseId)
        const isCurrent = data!.snapshot.tournament.currentRoundId === r.id
        return (
          <div key={r.id} className="card stack" style={{ padding: 14 }}>
            <div className="row row--between">
              <div>
                <strong>
                  {t.round.day(r.number)} {isCurrent && <span className="chip chip--sun">{R.current}</span>}
                </strong>
                <span className="help" style={{ display: 'block' }}>
                  {r.date ?? '—'} · {course?.name ?? R.noCourse} · {r.holes} {R.holes.toLowerCase()}
                </span>
              </div>
              <span className={`chip ${r.status === 'live' ? 'chip--teal' : r.status === 'cancelled' ? 'chip--coral' : ''}`}>{t.roundStatus[r.status]}</span>
            </div>
            <div className="row row--wrap">
              {r.status === 'scheduled' && (
                <button className="btn btn--primary btn--sm" type="button" onClick={() => void status(r, 'live')}>
                  {R.start}
                </button>
              )}
              {r.status === 'live' && (
                <button className="btn btn--primary btn--sm" type="button" onClick={() => void status(r, 'finished')}>
                  {R.finish}
                </button>
              )}
              {(r.status === 'finished' || r.status === 'cancelled') && (
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => void status(r, 'live')}>
                  {R.reopen}
                </button>
              )}
              {r.status !== 'cancelled' && (
                <button className="btn btn--ghost btn--sm coral" type="button" onClick={() => void status(r, 'cancelled')}>
                  {R.cancel}
                </button>
              )}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ id: r.id, number: r.number, date: r.date ?? '', course_id: r.courseId ?? '', holes: r.holes })}>
                {t.common.edit}
              </button>
              {courseTees(r.courseId).length > 1 && (
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setTeesFor(r)}>
                  {R.tees}
                </button>
              )}
              <button className="btn btn--ghost btn--sm coral" type="button" onClick={() => void remove(r)}>
                {t.common.delete}
              </button>
            </div>
          </div>
        )
      })}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t.common.edit : R.add}>
        {editing && (
          <div className="stack">
            <div className="grid2">
              <Field label={R.number}>
                <input className="input input--num" type="number" min={1} value={editing.number} onChange={(e) => setEditing({ ...editing, number: Number(e.target.value) || 1 })} />
              </Field>
              <Field label={R.holes}>
                <select className="select" value={editing.holes} onChange={(e) => setEditing({ ...editing, holes: Number(e.target.value) === 9 ? 9 : 18 })}>
                  <option value={18}>18</option>
                  <option value={9}>9</option>
                </select>
              </Field>
            </div>
            <Field label={R.date}>
              <input className="input" type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            </Field>
            <Field label={R.course}>
              <select className="select" value={editing.course_id} onChange={(e) => setEditing({ ...editing, course_id: e.target.value })}>
                <option value="">{R.noCourse}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void save()}>
              {t.common.save}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!teesFor} onClose={() => setTeesFor(null)} title={teesFor ? `${R.tees} · ${t.round.day(teesFor.number)}` : ''}>
        {teesFor && (
          <div className="list">
            {players.map((p) => {
              const rt = data!.snapshot.roundTees.find((x) => x.roundId === teesFor.id && x.playerId === p.id)
              return (
                <div key={p.id} className="listItem listItem--static">
                  <span className="grow">{p.displayName}</span>
                  <select
                    className="select input--sm"
                    style={{ width: 'auto' }}
                    value={rt?.teeId ?? ''}
                    onChange={async (e) => {
                      const teeId = e.target.value || null
                      try {
                        await setRoundTee(teesFor.id, p.id, teeId)
                        patch((s) => {
                          s.roundTees = s.roundTees.filter((x) => !(x.roundId === teesFor.id && x.playerId === p.id))
                          if (teeId) s.roundTees.push({ roundId: teesFor.id, playerId: p.id, teeId })
                        })
                      } catch (err) {
                        toast(err instanceof Error ? err.message : String(err))
                      }
                    }}
                  >
                    <option value="">{R.teeDefault}</option>
                    {courseTees(teesFor.courseId).map((tee) => (
                      <option key={tee.id} value={tee.id}>
                        {tee.name}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </Sheet>
    </div>
  )
}

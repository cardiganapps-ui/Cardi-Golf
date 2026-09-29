/**
 * Rondas (§13): one ruled block per round with its date, course and status;
 * the one action that matters first, the rest quiet; finishing, cancelling
 * and deleting ask once and show busy.
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Field, Sheet, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { ApiError, deleteRound, setRoundStatus, setRoundTee, updateTournament, upsertRound } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import type { Round } from '../../engine/types'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { useCourses } from './useCourses'
import a from './Admin.module.css'
import { NumberField } from '../../components/NumberField'

const R = t.admin.rounds

function dateEs(iso: string | null): string {
  if (!iso) return R.noDate
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

type Ask = { kind: 'finish' | 'cancel' | 'delete' | 'start'; round: Round } | null

export function AdminRounds() {
  const { tournamentId } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const reload = useTournament((s) => s.reload)
  const patch = useTournament((s) => s.patch)
  const { courses } = useCourses()
  const rounds = data!.snapshot.rounds
  const players = data!.snapshot.players
  const flags = data!.state.flags
  const [editing, setEditing] = useState<{ id?: string; number: number; date: string; course_id: string; holes: 9 | 18 } | null>(null)
  const [teesFor, setTeesFor] = useState<Round | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask>(null)

  async function save() {
    if (!editing) return
    setBusy(true)
    try {
      await upsertRound(tournamentId, { id: editing.id, number: editing.number, date: editing.date || null, course_id: editing.course_id || null, holes: editing.holes })
      await reload()
      setEditing(null)
    } catch (e) {
      toast(e instanceof ApiError && e.code === '23505' ? R.duplicateNumber(editing.number) : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const groupsOf = (rid: string) => data!.snapshot.groups.filter((g) => g.roundId === rid).length
  const liveOther = (rid: string) => rounds.find((x) => x.id !== rid && x.status === 'live') ?? null

  /** "Iniciar" needs groups; another live round asks first. */
  function askStart(r: Round) {
    if (groupsOf(r.id) === 0) {
      toast(R.needsGroups)
      return
    }
    if (liveOther(r.id)) setAsk({ kind: 'start', round: r })
    else void status(r, 'live')
  }

  async function status(r: Round, s: Round['status']) {
    setBusyId(r.id)
    try {
      await setRoundStatus(r.id, s)
      if (s === 'live') await updateTournament(tournamentId, { current_round_id: r.id, status: 'live' })
      if (s === 'scheduled' && data!.snapshot.tournament.currentRoundId === r.id) await updateTournament(tournamentId, { current_round_id: null })
      await reload()
      setAsk(null)
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(r: Round) {
    setBusyId(r.id)
    try {
      await deleteRound(r.id)
      await reload()
      setAsk(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const courseTees = (courseId: string | null) => data!.snapshot.courses.find((c) => c.id === courseId)?.tees ?? []
  const pendingFor = (rid: string) => flags.pendingSnakeTiebreaks.filter((q) => q.roundId === rid).length + flags.discrepancies.filter((d) => d.roundId === rid).length + flags.unsignedCards.filter((u) => u.roundId === rid).length

  const askBody = ask
    ? ask.kind === 'finish'
      ? `${R.finishConfirm(ask.round.number)}${pendingFor(ask.round.id) ? ` ${R.pendingBeforeFinish(pendingFor(ask.round.id))}` : ''}`
      : ask.kind === 'cancel'
        ? R.cancelConfirm(ask.round.number)
        : ask.kind === 'start'
          ? R.startWhileLive(liveOther(ask.round.id)?.number ?? 0)
          : R.deleteConfirm(ask.round.number)
    : ''

  return (
    <div className={a.screen}>
      <div className={a.head}>
        <h2>{t.admin.sections.rounds}</h2>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setEditing({ number: rounds.reduce((m, r) => Math.max(m, r.number), 0) + 1, date: '', course_id: courses[0]?.id ?? '', holes: 18 })}>
          {R.add}
        </button>
      </div>
      {rounds.length === 0 && <EmptyState title={t.admin.sections.rounds} body={R.empty} />}
      {rounds.map((r) => {
        const course = courses.find((c) => c.id === r.courseId)
        const isCurrent = data!.snapshot.tournament.currentRoundId === r.id
        const incomplete = flags.incompleteRounds.find((x) => x.roundId === r.id)
        const rb = busyId === r.id
        return (
          <section key={r.id} className={a.section} aria-busy={rb}>
            <div className={a.sectionTitle}>
              <span className={a.rowText}>
                <strong>
                  {t.round.day(r.number)}
                  {isCurrent ? `, ${R.current.toLowerCase()}` : ''}
                </strong>
                <span className={a.rowSub}>
                  {dateEs(r.date)}, {course?.name ?? R.noCourse}, {r.holes} {R.holes.toLowerCase()}
                </span>
              </span>
              <span className={`chip ${r.status === 'live' ? 'chip--teal' : r.status === 'cancelled' ? 'chip--coral' : ''}`}>{t.roundStatus[r.status]}</span>
            </div>
            {incomplete && <span className={a.warn}>{t.admin.inbox.incomplete(incomplete.players.length)}</span>}
            <div className={a.chipRow} style={undefined}>
              {r.status === 'scheduled' && (
                <button className="btn btn--primary btn--sm" type="button" disabled={rb} onClick={() => askStart(r)}>
                  {rb ? t.common.saving : R.start}
                </button>
              )}
              {r.status === 'live' && (
                <button className="btn btn--primary btn--sm" type="button" disabled={rb} onClick={() => setAsk({ kind: 'finish', round: r })}>
                  {R.finish}
                </button>
              )}
              {(r.status === 'finished' || r.status === 'cancelled') && (
                <button className="btn btn--secondary btn--sm" type="button" disabled={rb} onClick={() => void status(r, isCurrent ? 'live' : 'scheduled')}>
                  {rb ? t.common.saving : isCurrent ? R.reopen : R.reschedule}
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
              {r.status !== 'cancelled' && (
                <button className="btn btn--ghost btn--sm" type="button" disabled={rb} onClick={() => setAsk({ kind: 'cancel', round: r })}>
                  {R.cancel}
                </button>
              )}
              <button className="btn btn--ghost btn--sm" type="button" disabled={rb} onClick={() => setAsk({ kind: 'delete', round: r })}>
                {t.common.delete}
              </button>
            </div>
          </section>
        )
      })}

      <ConfirmSheet
        open={!!ask}
        title={ask ? (ask.kind === 'finish' ? R.finish : ask.kind === 'cancel' ? R.cancel : ask.kind === 'start' ? R.start : t.common.delete) : ''}
        body={askBody}
        danger={ask?.kind === 'cancel' || ask?.kind === 'delete'}
        busy={!!busyId}
        confirmLabel={ask ? (ask.kind === 'finish' ? R.finish : ask.kind === 'cancel' ? R.cancel : ask.kind === 'start' ? R.start : t.common.delete) : undefined}
        onConfirm={() => ask && (ask.kind === 'delete' ? void remove(ask.round) : void status(ask.round, ask.kind === 'finish' ? 'finished' : ask.kind === 'start' ? 'live' : 'cancelled'))}
        onClose={() => setAsk(null)}
      />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t.common.edit : R.add}>
        {editing && (
          <div className="stack">
            <div className={a.grid2}>
              <Field label={R.number}>
                <NumberField min={1} value={editing.number} onChange={(v) => setEditing({ ...editing, number: v })} />
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
              {busy ? t.common.saving : t.common.save}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!teesFor} onClose={() => setTeesFor(null)} title={teesFor ? `${R.tees}, ${t.round.day(teesFor.number)}` : ''}>
        {teesFor && (
          <div className={a.rows}>
            {players.map((p) => {
              const rt = data!.snapshot.roundTees.find((x) => x.roundId === teesFor.id && x.playerId === p.id)
              return (
                <div key={p.id} className={a.row}>
                  <span className={a.rowText} style={undefined}>
                    <span className={a.rowTitle}>{p.displayName}</span>
                  </span>
                  <span className={a.rowActions}>
                    <select
                      className="select"
                      value={rt?.teeId ?? ''}
                      aria-label={`${R.tees}, ${p.displayName}`}
                      onChange={async (e) => {
                        const teeId = e.target.value || null
                        try {
                          await setRoundTee(teesFor.id, p.id, teeId)
                          patch((s) => {
                            s.roundTees = s.roundTees.filter((x) => !(x.roundId === teesFor.id && x.playerId === p.id))
                            if (teeId) s.roundTees.push({ roundId: teesFor.id, playerId: p.id, teeId })
                          })
                          toast(R.teeSaved)
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
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Sheet>
    </div>
  )
}

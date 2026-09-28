/**
 * Hándicaps (§13 "Day 2 handicaps"): per round, each player's playing
 * handicap as the figure, with base, course, previous-day points and the cut
 * as the sub line; overrides with a reason (audit-logged).
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { Avatar, Field, Sheet, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { deleteHandicapOverride, upsertHandicapOverride } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { IconClose } from '../../components/icons'
import a from './Admin.module.css'

const H = t.admin.handicaps

export function AdminHandicaps() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me } = useTournamentCtx()
  const { snapshot, state } = data
  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled')
  const [roundId, setRoundId] = useState<string>(snapshot.tournament.currentRoundId ?? rounds[0]?.id ?? '')
  const [editing, setEditing] = useState<{ playerId: string; value: number; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const rs = state.core.rounds[roundId] ?? {}

  async function save() {
    if (!editing || editing.reason.trim().length < 3) return
    setBusy(true)
    try {
      await upsertHandicapOverride(roundId, editing.playerId, editing.value, editing.reason.trim(), me.playerId)
      await reload()
      setEditing(null)
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  async function clear(playerId: string) {
    setBusy(true)
    try {
      await deleteHandicapOverride(roundId, playerId)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={a.screen}>
      <h2>{t.admin.sections.handicaps}</h2>
      <p className={a.help}>{H.hint}</p>
      {rounds.length === 0 && <EmptyState title={t.admin.sections.handicaps} body={H.noRounds} />}
      {rounds.length > 0 && (
        <>
          <div className="segmented" role="tablist">
            {rounds.map((r) => (
              <button key={r.id} type="button" role="tab" aria-selected={r.id === roundId} onClick={() => setRoundId(r.id)}>
                {t.round.day(r.number)}
              </button>
            ))}
          </div>
          {snapshot.players.length === 0 && <span className={a.help}>{t.admin.players.empty}</span>}
          <div className={a.rows}>
            {snapshot.players.map((p) => {
              const pr = rs[p.id]
              if (!pr) return null
              const prevRound = rounds.find((r) => r.number === pr.roundNumber - 1)
              const prev = prevRound ? state.core.rounds[prevRound.id]?.[p.id] : undefined
              const base = state.core.handicaps[p.id]?.base ?? p.baseHcp
              return (
                <div key={p.id} className={a.row}>
                  <Avatar name={p.displayName} url={p.avatarUrl} />
                  <span className={a.rowText} style={{ flex: 1 }}>
                    <span className={a.rowTitle}>{p.displayName}</span>
                    <span className={a.rowSub}>
                      {H.base} {base}
                      {pr.courseHcp !== base ? `, ${H.course.toLowerCase()} ${pr.courseHcp}` : ''}
                      {prev ? `, ${t.round.day(prev.roundNumber).toLowerCase()} ${prev.points} pts` : ''}
                      {pr.cut ? `, ${H.cut.toLowerCase()} −${pr.cut}` : ''}
                      {pr.overridden ? `, ${H.override.toLowerCase()}` : ''}
                    </span>
                  </span>
                  <span className={a.fig} aria-label={`${H.plays} ${pr.playingHcp}`}>
                    {pr.playingHcp}
                  </span>
                  <span className={a.rowActions}>
                    <HowCalculated why={pr.playingHcpWhy} label="?" />
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ playerId: p.id, value: pr.playingHcp, reason: '' })}>
                      {t.common.edit}
                    </button>
                    {pr.overridden && (
                      <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void clear(p.id)} aria-label={t.common.delete}>
                        <IconClose />
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={H.override}>
        {editing && (
          <div className="stack">
            <p className={a.help}>{H.overrideHint}</p>
            <Field label={t.live.playingHcp}>
              <input className="input input--num" type="number" min={0} max={60} value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} />
            </Field>
            <Field label={H.reason}>
              <input className="input" value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} placeholder={H.reasonPlaceholder} autoFocus />
            </Field>
            <button className="btn btn--primary" type="button" disabled={busy || editing.reason.trim().length < 3} onClick={() => void save()}>
              {busy ? t.common.saving : t.common.save}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

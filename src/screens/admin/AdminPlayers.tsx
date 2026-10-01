/**
 * Jugadores (§13): the roster as ruled rows with the handicap as the figure,
 * search when the list is long, and an edit sheet with the three handicap
 * sources, the estimate from three scores (§13b-E) and a live preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, Toggle, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { HowCalculated } from '../../components/HowCalculated'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { deletePlayer, playersWithPin, setPlayerPin, uploadAsset, upsertPlayer, type PlayerInput } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { courseHandicap, estimateIndex, playingHandicap, strokesReceived } from '../../engine/core/handicap'
import type { EstimateInput, Player } from '../../engine/types'
import { downscaleImage } from '../../lib/images'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { useTournamentProfiles } from '../../data/profiles'
import { ProfileLink } from './ProfileLink'
import { entryChanged } from './entryInfo'
import a from './Admin.module.css'
import { NumberField, OptionalNumberField } from '../../components/NumberField'
import { humanError } from '../../lib/humanError'

const P = t.admin.players
const SEARCH_FROM = 12

function toInput(p: Player | null, sortOrder: number): PlayerInput {
  return {
    id: p?.id,
    full_name: p?.fullName ?? '',
    display_name: p?.displayName ?? '',
    tier: p?.tier ?? null,
    base_hcp: p?.baseHcp ?? 18,
    handicap_source: p?.handicapSource ?? 'manual',
    handicap_index: p?.handicapIndex ?? null,
    estimate_inputs: p?.estimateInputs ?? null,
    default_tee_id: p?.defaultTeeId ?? null,
    is_honoree: p?.isHonoree ?? false,
    is_admin: p?.isAdmin ?? false,
    avatar_url: p?.avatarUrl ?? null,
    form_guide: p?.formGuide ?? null,
    sort_order: p?.sortOrder ?? sortOrder,
  }
}

const emptyEstimate = (): [EstimateInput, EstimateInput, EstimateInput] => [
  { gross: 85, rating: null, slope: null, par: null },
  { gross: 92, rating: null, slope: null, par: null },
  { gross: 100, rating: null, slope: null, par: null },
]

/** "2 en SI 1–7, 1 en SI 8–18" from the 18 per-SI stroke counts. */
function strokeRanges(strokes: number[]): string {
  const parts: string[] = []
  let start = 0
  for (let i = 1; i <= strokes.length; i++) {
    if (i === strokes.length || strokes[i] !== strokes[start]) {
      const n = strokes[start]!
      if (n > 0) parts.push(`${n} en SI ${start + 1}${i - 1 > start ? `–${i}` : ''}`)
      start = i
    }
  }
  return parts.length ? parts.join(', ') : P.strokesOn(0)
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function AdminPlayers() {
  const { tournamentId } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const reload = useTournament((s) => s.reload)
  const players = data!.snapshot.players
  const settings = data!.settings
  const tees = data!.snapshot.courses.flatMap((c) => c.tees.map((tee) => ({ ...tee, courseName: c.name })))
  const [editing, setEditing] = useState<PlayerInput | null>(null)
  const [pins, setPins] = useState<Set<string>>(new Set())
  const [pinFor, setPinFor] = useState<Player | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [profiles, reloadProfiles] = useTournamentProfiles(tournamentId)

  useEffect(() => {
    playersWithPin(tournamentId).then(setPins).catch(() => undefined)
  }, [tournamentId, players.length])

  const shown = useMemo(() => {
    const needle = norm(q.trim())
    return needle ? players.filter((p) => norm(p.fullName).includes(needle) || norm(p.displayName).includes(needle)) : players
  }, [players, q])

  const preview = useMemo(() => {
    if (!editing) return null
    let base = editing.base_hcp
    let estimate: ReturnType<typeof estimateIndex> | null = null
    if (editing.handicap_source === 'estimate' && editing.estimate_inputs) {
      estimate = estimateIndex(editing.estimate_inputs, settings.handicap)
      base = estimate.value
    } else if (editing.handicap_source === 'index') base = editing.handicap_index ?? 0
    let courseHcp = base
    const tee = tees.find((x) => x.id === editing.default_tee_id)
    if (editing.handicap_source !== 'manual' && tee) {
      courseHcp = courseHandicap(base, { slope: tee.slope, rating: tee.rating, par: tee.holes.reduce((s, h) => s + h.par, 0) || 72 }).value
    }
    const ph = playingHandicap(courseHcp, settings.handicap)
    const strokes = Array.from({ length: 18 }, (_, i) => strokesReceived(ph.value, i + 1))
    return { base, courseHcp, ph, strokes, estimate }
  }, [editing, settings.handicap, tees])

  async function save() {
    if (!editing) return
    setBusy(true)
    try {
      const input = { ...editing }
      if (input.handicap_source === 'estimate' && preview?.estimate) input.base_hcp = preview.estimate.value
      if (input.handicap_source === 'index') input.base_hcp = input.handicap_index ?? 0
      if (!input.display_name.trim()) input.display_name = input.full_name.split(' ')[0] ?? input.full_name
      await upsertPlayer(tournamentId, input)
      await reload()
      setEditing(null)
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing?.id) return
    setBusy(true)
    try {
      await deletePlayer(editing.id)
      await reload()
      setAskDelete(false)
      setEditing(null)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onAvatar(file: File) {
    if (!editing) return
    setBusy(true)
    try {
      const { blob, type } = await downscaleImage(file, 512)
      const id = editing.id ?? crypto.randomUUID()
      const url = await uploadAsset(`${tournamentId}/avatars/${id}.jpg`, blob, type)
      setEditing({ ...editing, avatar_url: url })
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function savePin() {
    if (!pinFor || !/^\d{4}$/.test(pin)) return
    setBusy(true)
    try {
      await setPlayerPin(pinFor.id, pin)
      setPins(new Set([...pins, pinFor.id]))
      entryChanged()
      toast(P.pinSet)
      setPinFor(null)
      setPin('')
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  /** What a delete would take with it; a player with scores or a sold lot cannot be deleted (void him instead). */
  const deleteInfo = useMemo(() => {
    if (!editing?.id) return null
    const id = editing.id
    const snap = data!.snapshot
    const scores = snap.scores.filter((s) => s.playerId === id).length
    const sold = snap.calcuttaLots.some((l) => l.playerId === id && l.status === 'sold') || snap.calcuttaLots.some((l) => l.ownerId === id && l.status === 'sold')
    const pair = snap.pairs.find((p) => p.player1Id === id || p.player2Id === id)
    const partner = pair ? players.find((p) => p.id === (pair.player1Id === id ? pair.player2Id : pair.player1Id)) : undefined
    const payments = snap.payments.filter((p) => p.fromPlayerId === id || p.toPlayerId === id).length
    const groups = snap.groups.filter((g) => g.playerIds.includes(id)).length
    return { scores, sold, partner, payments, groups, blocked: scores > 0 || sold }
  }, [editing?.id, data, players])

  const E = editing
  return (
    <div className={a.screen}>
      <div className={a.head}>
        <div className={a.rowText}>
          <h2>{t.admin.sections.players}</h2>
          {players.length > 0 && <span className={a.count}>{P.count(players.length)}</span>}
        </div>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setEditing(toInput(null, players.length))}>
          {P.add}
        </button>
      </div>
      {players.length === 0 && <EmptyState title={P.empty} body={P.emptyHint} />}
      {players.length > SEARCH_FROM && (
        <div className={a.search}>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={P.search} aria-label={P.search} />
          {shown.length === 0 && <span className={a.help}>{P.noMatch}</span>}
        </div>
      )}
      {players.length > 0 && (
        <div className={a.rows}>
          {shown.map((p) => (
            <div key={p.id} className={a.row}>
              <button type="button" className={a.rowBtn} onClick={() => setEditing(toInput(p, p.sortOrder))}>
                <Avatar name={p.displayName} url={p.avatarUrl} honoree={p.isHonoree} />
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{p.fullName}</span>
                  <span className={a.rowSub}>
                    {p.tier && <span className="tierBadge">{p.tier}</span>} {t.live.hcp} {p.baseHcp}
                    {p.handicapSource === 'estimate' ? `, ${P.estimated}` : ''}
                    {p.isAdmin ? `, ${P.committee}` : ''}
                    {profiles.some((x) => x.playerId === p.id && x.status === 'confirmed') ? `, ${P.linkedTo(profiles.find((x) => x.playerId === p.id)!.handle)}` : ''}
                  </span>
                </span>
              </button>
              <button
                className={`btn btn--sm ${pins.has(p.id) ? 'btn--ghost' : 'btn--secondary'}`}
                type="button"
                onClick={() => {
                  setPinFor(p)
                  setPin('')
                }}
              >
                {pins.has(p.id) ? P.resetPin : P.setPin}
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!E} onClose={() => setEditing(null)} title={E?.id ? t.common.edit : P.add}>
        {E && (
          <div className="stack">
            <div className={a.chipRow}>
              <Avatar name={E.display_name || E.full_name || '?'} url={E.avatar_url} size="lg" honoree={E.is_honoree} />
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                {P.uploadAvatar}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => e.target.files?.[0] && void onAvatar(e.target.files[0])} />
            </div>
            <Field label={P.fullName}>
              <input className="input" value={E.full_name} onChange={(e) => setEditing({ ...E, full_name: e.target.value })} autoFocus={!E.id} />
            </Field>
            <div className={a.grid2}>
              <Field label={P.displayName}>
                <input className="input" value={E.display_name} onChange={(e) => setEditing({ ...E, display_name: e.target.value })} />
              </Field>
              <Field label={P.tier}>
                <select className="select" value={E.tier ?? ''} onChange={(e) => setEditing({ ...E, tier: e.target.value || null })}>
                  <option value="">{t.common.none}</option>
                  {settings.tiers.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={P.tee}>
              <select className="select" value={E.default_tee_id ?? ''} onChange={(e) => setEditing({ ...E, default_tee_id: e.target.value || null })}>
                <option value="">{t.common.none}</option>
                {tees.map((tee) => (
                  <option key={tee.id} value={tee.id}>
                    {tee.courseName}, {tee.name}
                    {tee.rating ? ` (${tee.rating} / ${tee.slope})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <span className="label">{P.handicap}</span>
            <div className="segmented" role="tablist">
              {(['manual', 'index', 'estimate'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={E.handicap_source === s}
                  onClick={() => setEditing({ ...E, handicap_source: s, estimate_inputs: s === 'estimate' ? (E.estimate_inputs ?? emptyEstimate()) : E.estimate_inputs })}
                >
                  {s === 'manual' ? P.sourceManual : s === 'index' ? P.sourceIndex : P.sourceEstimate}
                </button>
              ))}
            </div>
            {E.handicap_source === 'manual' && (
              <Field label={P.baseHcp}>
                <NumberField min={0} max={54} decimals={1} value={E.base_hcp} onChange={(v) => setEditing({ ...E, base_hcp: v })} />
              </Field>
            )}
            {E.handicap_source === 'index' && (
              <Field label={P.index}>
                <OptionalNumberField min={-10} max={54} decimals={1} value={E.handicap_index} onChange={(v) => setEditing({ ...E, handicap_index: v })} />
              </Field>
            )}
            {E.handicap_source === 'estimate' && E.estimate_inputs && (
              <div className="stack">
                {([P.goodDay, P.normalDay, P.badDay] as const).map((lbl, i) => {
                  const row = E.estimate_inputs![i]!
                  const upd = (patch: Partial<EstimateInput>) => {
                    const next = [...E.estimate_inputs!] as [EstimateInput, EstimateInput, EstimateInput]
                    next[i] = { ...row, ...patch }
                    setEditing({ ...E, estimate_inputs: next })
                  }
                  const par = row.par ?? 72
                  const weird = row.gross < par - 5 || row.gross > par + 60
                  return (
                    <div key={lbl} className={a.section}>
                      <div className={a.sectionTitle}>
                        <strong>{lbl}</strong>
                      </div>
                      <div className={a.grid2}>
                        <Field label={P.gross}>
                          <NumberField min={1} value={row.gross} onChange={(v) => upd({ gross: v })} />
                        </Field>
                        <Field label={P.par}>
                          <OptionalNumberField placeholder="72" value={row.par} onChange={(v) => upd({ par: v })} />
                        </Field>
                        <Field label={`${P.rating}${row.rating == null ? `, ${P.assumed}` : ''}`}>
                          <OptionalNumberField decimals={1} placeholder="72" value={row.rating} onChange={(v) => upd({ rating: v })} />
                        </Field>
                        <Field label={`${P.slope}${row.slope == null ? `, ${P.assumed}` : ''}`}>
                          <OptionalNumberField placeholder="113" value={row.slope} onChange={(v) => upd({ slope: v })} />
                        </Field>
                      </div>
                      {weird && <p className={a.warn}>{P.areYouSure}</p>}
                    </div>
                  )
                })}
              </div>
            )}

            {preview && (
              <div className={a.section}>
                <div className={a.sectionTitle}>
                  <strong>{P.preview}</strong>
                  <HowCalculated why={preview.estimate ? [preview.estimate.why, preview.ph.why] : preview.ph.why} />
                </div>
                <div className={a.chipRow}>
                  <span className={`${a.fig} ${a.figLg}`}>{preview.ph.value}</span>
                  <span className={a.rowText}>
                    <span>{P.previewPh(preview.ph.value)}</span>
                    <span className={a.rowSub}>
                      {preview.courseHcp !== preview.base ? `${P.courseHcp(preview.courseHcp)}, ` : ''}
                      {P.strokesLine(strokeRanges(preview.strokes))}
                    </span>
                  </span>
                </div>
              </div>
            )}

            <Toggle label={`${P.honoree} (${settings.labels.honoree})`} checked={E.is_honoree} onChange={(v) => setEditing({ ...E, is_honoree: v })} />
            <Toggle label={P.admin} checked={E.is_admin} onChange={(v) => setEditing({ ...E, is_admin: v })} />
            {E.id && (
              <ProfileLink
                playerId={E.id}
                profile={profiles.find((x) => x.playerId === E.id)}
                onChanged={reloadProfiles}
                onUseIndex={(index) => {
                  setEditing({ ...E, handicap_source: 'index', handicap_index: index })
                  toast(P.indexApplied)
                }}
              />
            )}
            <Field label={P.formGuide}>
              <textarea className="textarea" value={E.form_guide ?? ''} onChange={(e) => setEditing({ ...E, form_guide: e.target.value || null })} />
            </Field>
            <div className={a.formActions}>
              {E.id ? (
                <button className="btn btn--danger" type="button" onClick={() => setAskDelete(true)} disabled={busy}>
                  {t.common.delete}
                </button>
              ) : (
                <span />
              )}
              <button className="btn btn--primary" type="button" onClick={() => void save()} disabled={busy || !E.full_name.trim()}>
                {busy ? t.common.saving : t.common.save}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={askDelete}
        title={t.common.delete}
        body={deleteInfo?.blocked ? P.deleteBlocked(deleteInfo.scores, deleteInfo.sold) : deleteInfo ? P.deleteTakes(deleteInfo.partner?.displayName ?? null, deleteInfo.groups, deleteInfo.payments) : t.common.confirmDelete}
        danger
        busy={busy}
        confirmLabel={t.common.delete}
        onConfirm={() => (deleteInfo?.blocked ? setAskDelete(false) : void remove())}
        onClose={() => setAskDelete(false)}
      />

      <Sheet open={!!pinFor} onClose={() => setPinFor(null)} title={`${P.pin}, ${pinFor?.displayName ?? ''}`}>
        <div className="stack">
          <p className={a.help}>{t.enter.pinHint}</p>
          <input className={`input ${a.pinInput}`} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus placeholder={P.pinInput} aria-label={P.pinInput} />
          <button className="btn btn--primary" type="button" disabled={busy || pin.length !== 4} onClick={() => void savePin()}>
            {busy ? t.common.saving : t.common.save}
          </button>
        </div>
      </Sheet>
    </div>
  )
}

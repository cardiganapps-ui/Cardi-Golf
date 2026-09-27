import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, Toggle, toast } from '../../components/ui'
import { deletePlayer, playersWithPin, setPlayerPin, uploadAsset, upsertPlayer, type PlayerInput } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { courseHandicap, estimateIndex, playingHandicap, strokesReceived } from '../../engine/core/handicap'
import type { EstimateInput, Player } from '../../engine/types'
import { downscaleImage } from '../../lib/images'
import { useTournamentCtx } from '../tournament/TournamentGate'

const P = t.admin.players

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
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    playersWithPin(tournamentId).then(setPins).catch(() => undefined)
  }, [tournamentId, players.length])

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
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing?.id || !confirm(t.common.confirmDelete)) return
    setBusy(true)
    try {
      await deletePlayer(editing.id)
      await reload()
      setEditing(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
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
      toast(e instanceof Error ? e.message : String(e))
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
      toast(P.pinSet)
      setPinFor(null)
      setPin('')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const E = editing
  return (
    <div className="stack">
      <div className="row row--between">
        <h2>{t.admin.sections.players}</h2>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setEditing(toInput(null, players.length))}>
          {P.add}
        </button>
      </div>
      {players.length === 0 && <p className="muted">{P.empty}</p>}
      <div className="list">
        {players.map((p) => (
          <div key={p.id} className="listItem listItem--static">
            <Avatar name={p.displayName} url={p.avatarUrl} honoree={p.isHonoree} />
            <button type="button" className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => setEditing(toInput(p, p.sortOrder))}>
              <strong>{p.fullName}</strong>
              <span className="help" style={{ display: 'block' }}>
                {p.tier && <span className="tierBadge" style={{ marginRight: 6 }}>{p.tier}</span>}
                {t.live.hcp} {p.baseHcp}
                {p.handicapSource === 'estimate' ? ` (${P.estimated})` : ''}
                {p.isAdmin ? ' · Comité' : ''}
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

      <Sheet open={!!E} onClose={() => setEditing(null)} title={E?.id ? t.common.edit : P.add}>
        {E && (
          <div className="stack">
            <div className="row">
              <Avatar name={E.display_name || E.full_name || '?'} url={E.avatar_url} size="lg" honoree={E.is_honoree} />
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                {P.uploadAvatar}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => e.target.files?.[0] && void onAvatar(e.target.files[0])} />
            </div>
            <Field label={P.fullName}>
              <input className="input" value={E.full_name} onChange={(e) => setEditing({ ...E, full_name: e.target.value })} autoFocus={!E.id} />
            </Field>
            <div className="grid2">
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
                    {tee.courseName} · {tee.name}
                    {tee.rating ? ` (${tee.rating}/${tee.slope})` : ''}
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
                <input className="input input--num" type="number" step="0.1" min={0} max={54} value={E.base_hcp} onChange={(e) => setEditing({ ...E, base_hcp: Number(e.target.value) })} />
              </Field>
            )}
            {E.handicap_source === 'index' && (
              <Field label={P.index}>
                <input className="input input--num" type="number" step="0.1" min={-10} max={54} value={E.handicap_index ?? ''} onChange={(e) => setEditing({ ...E, handicap_index: e.target.value === '' ? null : Number(e.target.value) })} />
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
                    <div key={lbl} className="card card--cell" style={{ padding: 10 }}>
                      <strong>{lbl}</strong>
                      <div className="row" style={{ marginTop: 6 }}>
                        <Field label={P.gross}>
                          <input className="input input--sm input--num" type="number" value={row.gross} onChange={(e) => upd({ gross: Number(e.target.value) })} />
                        </Field>
                        <Field label={`${P.rating}${row.rating == null ? ` (${P.assumed})` : ''}`}>
                          <input className="input input--sm input--num" type="number" step="0.1" placeholder="72" value={row.rating ?? ''} onChange={(e) => upd({ rating: e.target.value === '' ? null : Number(e.target.value) })} />
                        </Field>
                        <Field label={`${P.slope}${row.slope == null ? ` (${P.assumed})` : ''}`}>
                          <input className="input input--sm input--num" type="number" placeholder="113" value={row.slope ?? ''} onChange={(e) => upd({ slope: e.target.value === '' ? null : Number(e.target.value) })} />
                        </Field>
                        <Field label={P.par}>
                          <input className="input input--sm input--num" type="number" placeholder="72" value={row.par ?? ''} onChange={(e) => upd({ par: e.target.value === '' ? null : Number(e.target.value) })} />
                        </Field>
                      </div>
                      {weird && <p className="error small">{P.areYouSure}</p>}
                    </div>
                  )
                })}
                {preview?.estimate && (
                  <div className="card" style={{ padding: 12 }}>
                    <strong>{preview.estimate.why.title}</strong>
                    <ul className="small">
                      {preview.estimate.why.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {preview && (
              <div className="card card--deep" style={{ padding: 12 }}>
                <span className="label" style={{ color: 'var(--seafoam)' }}>
                  {P.preview}
                </span>
                <p>
                  <strong>{P.previewPh(preview.ph.value)}</strong>
                  {preview.courseHcp !== preview.base ? ` · hándicap de campo ${preview.courseHcp}` : ''}
                </p>
                <p className="small">{preview.ph.why.steps.join(' · ')}</p>
                <div className="row row--wrap" style={{ gap: 4, marginTop: 8 }}>
                  {preview.strokes.map((n, i) => (
                    <span key={i} className="chip" style={{ height: 24, padding: '0 6px', fontSize: '0.7rem', background: n ? 'var(--sun)' : 'rgba(255,255,255,0.15)', color: n ? 'var(--ink)' : 'var(--paper)' }}>
                      SI{i + 1} {'•'.repeat(n)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Toggle label={`${P.honoree} (${settings.labels.honoree})`} checked={E.is_honoree} onChange={(v) => setEditing({ ...E, is_honoree: v })} />
            <Toggle label={P.admin} checked={E.is_admin} onChange={(v) => setEditing({ ...E, is_admin: v })} />
            <Field label={P.formGuide}>
              <textarea className="textarea" value={E.form_guide ?? ''} onChange={(e) => setEditing({ ...E, form_guide: e.target.value || null })} />
            </Field>
            <div className="row">
              {E.id && (
                <button className="btn btn--ghost coral" type="button" onClick={() => void remove()} disabled={busy}>
                  {t.common.delete}
                </button>
              )}
              <button className="btn btn--primary grow" type="button" onClick={() => void save()} disabled={busy || !E.full_name.trim()}>
                {busy ? t.common.saving : t.common.save}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!pinFor} onClose={() => setPinFor(null)} title={`${P.pin} · ${pinFor?.displayName ?? ''}`}>
        <div className="stack">
          <p className="help">{t.enter.pinHint}</p>
          <input className="input num" style={{ fontSize: '2rem', letterSpacing: '0.5em', textAlign: 'center' }} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus placeholder={P.pinInput} />
          <button className="btn btn--primary" type="button" disabled={busy || pin.length !== 4} onClick={() => void savePin()}>
            {t.common.save}
          </button>
        </div>
      </Sheet>
    </div>
  )
}

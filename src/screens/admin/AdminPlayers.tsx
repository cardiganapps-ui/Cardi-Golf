/**
 * Jugadores (§13): the roster as ruled rows with the handicap as the figure,
 * search when the list is long, and an edit sheet with the three handicap
 * sources, the estimate from three scores (§13b-E) and a live preview.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { handicapText, hcpFromTo, t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, Toggle } from '../../components/ui'
import { toast } from '../../components/toast'
import { EmptyState, Segmented } from '../../components/primitives'
import { HowCalculated } from '../../components/HowCalculated'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { ReasonSheet } from '../../components/ReasonSheet'
import { HandicapChanges } from '../../components/HandicapChanges'
import { localWhen } from '../../lib/localWhen'
import { deletePlayer, lockHandicaps, playersWithPin, setPlayerPin, unlockHandicaps, updatePlayer, uploadAsset, upsertPlayer, type PlayerInput } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { courseHandicap, estimateIndex, playingHandicap, strokesReceived } from '../../engine/core/handicap'
import { baseHandicap } from '../../engine/core/compute'
import { handicapsLocked, handicapUsed } from '../../engine/core/handicapLock'
import type { HandicapInputs, Player } from '../../engine/types'
import { downscaleImage, extensionFor } from '../../lib/images'
import { useTournamentCtx } from '../tournament/tournamentContext'
import { useTournamentProfiles } from '../../data/profiles'
import { ProfileLink } from './ProfileLink'
import { completePlayer, type DraftEstimate, type PlayerDraft } from './playerDraft'
import a from './Admin.module.css'
import { OthersDataNotice } from '../../components/LegalLinks'
import { OptionalNumberField } from '../../components/NumberField'
import { clockTime } from '../../lib/freshness'
import { humanError } from '../../lib/humanError'
import { phonesOf, pinLocks, playerPhones, releasePhone, unlockPin, type PinLock, type PinPhone } from '../../data/pinPhones'
import { CorrectionsCard } from './CorrectionsCard'
import { randomPin } from '../../lib/pins'
import { InviteBlock, PinTools } from './PinInvites'

const P = t.admin.players
const L = t.admin.players.lock
const SEARCH_FROM = 12

/** The fields a handicap is computed from, of a stored player or of the sheet's. */
const inputsOf = (p: Player): HandicapInputs => ({ handicapSource: p.handicapSource, baseHcp: p.baseHcp, handicapIndex: p.handicapIndex, estimateInputs: p.estimateInputs })
const inputsOfRow = (p: PlayerInput): HandicapInputs => ({ handicapSource: p.handicap_source, baseHcp: p.base_hcp, handicapIndex: p.handicap_index, estimateInputs: p.estimate_inputs })

function toInput(p: Player | null, sortOrder: number): PlayerDraft {
  return {
    id: p?.id,
    full_name: p?.fullName ?? '',
    display_name: p?.displayName ?? '',
    tier: p?.tier ?? null,
    base_hcp: p?.baseHcp ?? null,
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

const emptyEstimate = (): [DraftEstimate, DraftEstimate, DraftEstimate] => [
  { gross: null, rating: null, slope: null, par: null },
  { gross: null, rating: null, slope: null, par: null },
  { gross: null, rating: null, slope: null, par: null },
]

/**
 * "Golpes de ventaja: 2 en SI 1–7, 1 en SI 8–18" from the 18 per-SI stroke counts; a plus handicap's
 * "Devuelve: 1 en SI 18" (MONEY-21).
 */
function strokeRanges(strokes: number[]): string {
  const parts: string[] = []
  let start = 0
  for (let i = 1; i <= strokes.length; i++) {
    if (i === strokes.length || strokes[i] !== strokes[start]) {
      const n = strokes[start]!
      if (n !== 0) parts.push(`${Math.abs(n)} en SI ${start + 1}${i - 1 > start ? `–${i}` : ''}`)
      start = i
    }
  }
  if (!parts.length) return P.strokesLine(P.strokesOn(0))
  return strokes.some((n) => n < 0) ? P.givesBackLine(parts.join(', ')) : P.strokesLine(parts.join(', '))
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function AdminPlayers() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const reload = useTournament((s) => s.reload)
  const players = data!.snapshot.players
  const settings = data!.settings
  const tees = data!.snapshot.courses.flatMap((c) => c.tees.map((tee) => ({ ...tee, courseName: c.name })))
  const [editing, setEditing] = useState<PlayerDraft | null>(null)
  /** The form as it opened: anything typed since makes the sheet ask before it closes (UX-15). */
  const [editingFrom, setEditingFrom] = useState('')
  const startEditing = (p: PlayerDraft) => {
    setEditing(p)
    setEditingFrom(JSON.stringify(p))
  }
  const [pins, setPins] = useState<Set<string>>(new Set())
  /** Whether the server said who has a PIN: before it does, «Generar PINs» would count everyone as missing one. */
  const [pinsRead, setPinsRead] = useState(false)
  const [pinFor, setPinFor] = useState<Player | null>(null)
  const [pin, setPin] = useState('')
  /** The PIN just saved in the open sheet, shown with his invite until the sheet closes (UX-20); then gone. */
  const [savedPin, setSavedPin] = useState<string | null>(null)
  /** Saving swaps the field for the PIN, and «Guardar» goes with it: focus moves to what took its place (A11Y-12). */
  const savedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (savedPin) savedRef.current?.focus({ preventScroll: true })
  }, [savedPin])
  const closePin = () => {
    setPinFor(null)
    setPin('')
    setSavedPin(null)
  }
  /** The phones holding each player's PIN (TRUST-24); null while unread or on a server without them. */
  const [phones, setPhones] = useState<PinPhone[] | null>(null)
  /** PINs locked for new phones by wrong guesses (SEC-04); null while unread or on a server without 0056. */
  const [locks, setLocks] = useState<PinLock[] | null>(null)
  /** The phone about to be taken off its player: the reason sheet is open for it. */
  const [removing, setRemoving] = useState<PinPhone | null>(null)
  const [busy, setBusy] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [profiles, reloadProfiles] = useTournamentProfiles(tournamentId)
  const noticeId = useId()
  const lockId = useId()
  const tournament = data!.snapshot.tournament
  // Fixed by the Comité or by the tournament leaving setup (UX-28): a change from here needs a reason (0046).
  const locked = handicapsLocked(tournament)
  const changes = data!.state.flags.handicapChanges
  const [askLock, setAskLock] = useState(false)
  const [askFree, setAskFree] = useState(false)
  /** The player about to be saved over a fixed handicap: the reason sheet is open for him. */
  const [askReason, setAskReason] = useState<(PlayerInput & { id: string }) | null>(null)

  useEffect(() => {
    playersWithPin(tournamentId)
      .then((s) => {
        setPins(s)
        setPinsRead(true)
      })
      .catch(() => undefined)
  }, [tournamentId, players.length])
  // Read again with the players, and each time the PIN sheet opens: a phone may have entered meanwhile.
  useEffect(() => {
    playerPhones(tournamentId).then(setPhones).catch(() => undefined)
    pinLocks(tournamentId).then(setLocks).catch(() => undefined)
  }, [tournamentId, players.length, pinFor])
  const lockOf = (playerId: string) => locks?.find((l) => l.playerId === playerId) ?? null

  const shown = useMemo(() => {
    const needle = norm(q.trim())
    return needle ? players.filter((p) => norm(p.fullName).includes(needle) || norm(p.displayName).includes(needle)) : players
  }, [players, q])

  const preview = useMemo(() => {
    // Nothing to preview until a handicap is typed: a preview of 18 read as his.
    const ready = editing ? completePlayer(editing) : null
    if (!ready) return null
    let base = ready.base_hcp
    let estimate: ReturnType<typeof estimateIndex> | null = null
    if (ready.handicap_source === 'estimate' && ready.estimate_inputs) {
      estimate = estimateIndex(ready.estimate_inputs, settings.handicap)
      base = estimate.value
    } else if (ready.handicap_source === 'index') base = ready.handicap_index ?? 0
    let courseHcp = base
    let course: ReturnType<typeof courseHandicap> | null = null
    const tee = tees.find((x) => x.id === ready.default_tee_id)
    if (ready.handicap_source !== 'manual' && tee) {
      course = courseHandicap(base, { slope: tee.slope, rating: tee.rating, par: tee.holes.reduce((s, h) => s + h.par, 0) || 72 })
      courseHcp = course.value
    }
    const ph = playingHandicap(courseHcp, settings.handicap)
    const strokes = Array.from({ length: 18 }, (_, i) => strokesReceived(ph.value, i + 1))
    return { base, courseHcp, course, ph, strokes, estimate }
  }, [editing, settings.handicap, tees])

  async function save() {
    const ready = editing ? completePlayer(editing) : null
    if (!ready) return
    const input = { ...ready }
    if (input.handicap_source === 'estimate' && preview?.estimate) input.base_hcp = preview.estimate.value
    if (input.handicap_source === 'index') input.base_hcp = input.handicap_index ?? 0
    if (!input.display_name.trim()) input.display_name = input.full_name.split(' ')[0] ?? input.full_name
    // A fixed handicap changes only with a reason: what the engine reads, not a base no rule reads (0046's handicap_used).
    const stored = input.id ? players.find((p) => p.id === input.id) : undefined
    if (locked && stored && input.id && handicapUsed(inputsOf(stored)) !== handicapUsed(inputsOfRow(input))) {
      setAskReason({ ...input, id: input.id })
      return
    }
    setBusy(true)
    try {
      await upsertPlayer(tournamentId, input)
      await reload()
      setEditing(null)
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
      // Fixed meanwhile from another phone: the boards say so now, and the next «Guardar» asks for the reason.
      void reload()
    } finally {
      setBusy(false)
    }
  }

  /** The sheet saved with the Comité's reason (update_player): the reason sheet shows any refusal itself. */
  async function saveWithReason(reason: string) {
    if (!askReason) return
    await updatePlayer(askReason, reason)
    await reload()
    setEditing(null)
    toast(t.common.saved)
  }

  async function fix() {
    setBusy(true)
    try {
      await lockHandicaps(tournamentId)
      await reload()
      setAskLock(false)
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
      const url = await uploadAsset(`${tournamentId}/avatars/${id}.${extensionFor(type)}`, blob, type)
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
      // setPlayerPin itself tells «Para empezar» (entryChanged): the card and the Torneo tab ask again.
      await setPlayerPin(pinFor.id, pin)
      setPins(new Set([...pins, pinFor.id]))
      toast(P.pinSet)
      // The sheet stays, with the PIN and his invite: one tap sends both (UX-20).
      setSavedPin(pin)
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
  const reasonFor = askReason ? players.find((p) => p.id === askReason.id) : undefined
  const reasonBody = askReason && reasonFor ? L.reasonBody(reasonFor.displayName, hcpFromTo(baseHandicap(inputsOf(reasonFor), settings), baseHandicap(inputsOfRow(askReason), settings))) : undefined
  const editingChange = E?.id ? changes.find((c) => c.playerId === E.id) : undefined
  return (
    <div className={a.screen}>
      <div className={a.head}>
        <div className={a.rowText}>
          <h2>{t.admin.sections.players}</h2>
          {players.length > 0 && <span className={a.count}>{P.count(players.length)}</span>}
        </div>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => startEditing(toInput(null, players.length))}>
          {P.add}
        </button>
      </div>
      {players.length === 0 && <EmptyState title={P.empty} body={P.emptyHint} />}
      {/* What players asked to correct about themselves (TRUST-16). */}
      <CorrectionsCard tournamentId={tournamentId} />
      {players.length > 0 && (
        <section className={a.section} aria-labelledby={lockId}>
          <div className={a.sectionTitle}>
            <strong id={lockId}>{L.title}</strong>
            {!locked ? (
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => setAskLock(true)} disabled={busy}>
                {L.fix}
              </button>
            ) : (
              tournament.status === 'setup' && (
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAskFree(true)} disabled={busy}>
                  {L.free}
                </button>
              )
            )}
          </div>
          <p className={a.help}>{locked ? L.fixed(tournament.handicapsLockedAt ? localWhen(tournament.handicapsLockedAt, settings.timezone) : null) : L.open}</p>
        </section>
      )}
      {players.length > 0 && pinsRead && <PinTools players={players} pins={pins} tournament={tournament.name} slug={slug} onSaved={(ids) => setPins((cur) => new Set([...cur, ...ids]))} />}
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
              <button type="button" className={a.rowBtn} onClick={() => startEditing(toInput(p, p.sortOrder))}>
                <Avatar name={p.displayName} url={p.avatarUrl} honoree={p.isHonoree} />
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{p.fullName}</span>
                  <span className={a.rowSub}>
                    {p.tier && <span className="tierBadge">{p.tier}</span>} {t.live.hcp} {handicapText(p.baseHcp)}
                    {p.handicapSource === 'estimate' ? `, ${P.estimated}` : ''}
                    {p.isAdmin ? `, ${P.committee}` : ''}
                    {changes.some((c) => c.playerId === p.id) ? `, ${L.changed}` : ''}
                    {phonesOf(phones, p.id).length > 1 ? `, ${P.phonesCount(phonesOf(phones, p.id).length)}` : ''}
                    {lockOf(p.id) ? `, ${P.pinLocked}` : ''}
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
                  setSavedPin(null)
                }}
              >
                {pins.has(p.id) ? P.resetPin : P.setPin}
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!E} onClose={() => setEditing(null)} title={E?.id ? t.common.edit : P.add} dirty={!!E && JSON.stringify(E) !== editingFrom}>
        {E && (
          <div className="stack">
            <OthersDataNotice id={noticeId} />
            <div className={a.chipRow}>
              <Avatar name={E.display_name || E.full_name || '?'} url={E.avatar_url} size="lg" honoree={E.is_honoree} />
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                {P.uploadAvatar}
              </button>
              {/* No `capture`: it opened the front camera only, and the Comité loads faces from photos it already has (PWA-16). The phone's sheet offers the camera too. */}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void onAvatar(e.target.files[0])} />
            </div>
            <Field label={P.fullName}>
              {/* A new player's sheet opens on this field, below the notice: a screen reader hears the notice with it. */}
              <input className="input" value={E.full_name} onChange={(e) => setEditing({ ...E, full_name: e.target.value })} autoFocus={!E.id} aria-describedby={noticeId} />
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
            {locked && E.id && <p className={a.help}>{L.fixedHint}</p>}
            {editingChange && <HandicapChanges change={editingChange} timeZone={settings.timezone} />}
            <Segmented
              value={E.handicap_source}
              options={(['manual', 'index', 'estimate'] as const).map((s) => ({ value: s, label: s === 'manual' ? P.sourceManual : s === 'index' ? P.sourceIndex : P.sourceEstimate }))}
              onChange={(s) => setEditing({ ...E, handicap_source: s, estimate_inputs: s === 'estimate' ? (E.estimate_inputs ?? emptyEstimate()) : E.estimate_inputs })}
              label={P.source}
            />
            {E.handicap_source === 'manual' && (
              <Field label={P.baseHcp}>
                <OptionalNumberField min={0} max={54} decimals={1} value={E.base_hcp} onChange={(v) => setEditing({ ...E, base_hcp: v })} />
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
                  const upd = (patch: Partial<DraftEstimate>) => {
                    const next = [...E.estimate_inputs!] as [DraftEstimate, DraftEstimate, DraftEstimate]
                    next[i] = { ...row, ...patch }
                    setEditing({ ...E, estimate_inputs: next })
                  }
                  const par = row.par ?? 72
                  const weird = row.gross != null && (row.gross < par - 5 || row.gross > par + 60)
                  return (
                    <div key={lbl} className={a.section}>
                      <div className={a.sectionTitle}>
                        <strong>{lbl}</strong>
                      </div>
                      <div className={a.grid2}>
                        <Field label={P.gross}>
                          <OptionalNumberField min={1} value={row.gross} onChange={(v) => upd({ gross: v })} />
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
                  <HowCalculated why={[preview.estimate?.why, preview.course?.why, preview.ph.why].filter((w) => !!w)} />
                </div>
                <div className={a.chipRow}>
                  <span className={`${a.fig} ${a.figLg}`}>{handicapText(preview.ph.value)}</span>
                  <span className={a.rowText}>
                    <span>{P.previewPh(preview.ph.value)}</span>
                    <span className={a.rowSub}>
                      {preview.courseHcp !== preview.base ? `${P.courseHcp(preview.courseHcp)}, ` : ''}
                      {strokeRanges(preview.strokes)}
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
            {!completePlayer(E) && <p className={a.help}>{P.hcpMissing[E.handicap_source]}</p>}
            <div className={a.formActions}>
              {E.id ? (
                <button className="btn btn--danger" type="button" onClick={() => setAskDelete(true)} disabled={busy}>
                  {t.common.delete}
                </button>
              ) : (
                <span />
              )}
              <button className="btn btn--primary" type="button" onClick={() => void save()} disabled={busy || !E.full_name.trim() || !completePlayer(E)}>
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

      <ConfirmSheet open={askLock} title={L.fixTitle} body={L.fixBody} busy={busy} confirmLabel={L.fix} onConfirm={() => void fix()} onClose={() => setAskLock(false)} />
      <ReasonSheet
        open={askFree}
        title={L.freeTitle}
        body={L.freeBody}
        confirmLabel={L.free}
        onConfirm={async (reason) => {
          await unlockHandicaps(tournamentId, reason)
          await reload()
        }}
        onClose={() => setAskFree(false)}
      />
      <ReasonSheet open={!!askReason} title={L.reasonTitle} body={reasonBody} confirmLabel={L.reasonConfirm} onConfirm={saveWithReason} onClose={() => setAskReason(null)} />
      <ReasonSheet
        open={!!removing}
        title={P.removePhoneTitle}
        body={P.removePhoneBody}
        confirmLabel={P.removePhone}
        danger
        onConfirm={async (reason) => {
          const gone = removing!
          await releasePhone(gone.id, reason)
          setRemoving(null)
          toast(P.phoneRemoved)
          // Off the list at once; the read that follows renumbers nothing (a phone keeps its number) but says what else changed.
          setPhones((cur) => (cur ? cur.filter((x) => x.id !== gone.id) : cur))
          void playerPhones(tournamentId).then(setPhones).catch(() => undefined)
        }}
        onClose={() => setRemoving(null)}
      />

      <Sheet open={!!pinFor} onClose={closePin} title={`${P.pin}, ${pinFor?.displayName ?? ''}`}>
        <div className="stack">
          {savedPin ? (
            <div ref={savedRef} tabIndex={-1} className="stack" role="status">
              <span className="label">{P.pins.shown}</span>
              <span className={a.pinShown}>{savedPin}</span>
              <p className={a.help}>{P.pins.shownHint}</p>
            </div>
          ) : (
            <>
              <p className={a.help}>{t.enter.pinHint}</p>
              <input className={`input ${a.pinInput}`} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus placeholder={P.pinInput} aria-label={P.pinInput} />
              {/* Four random digits, never «1234» or «7777» (UX-20): the Comité need not invent one. */}
              <div className={a.formActions}>
                <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => setPin(randomPin())}>
                  {P.pins.random}
                </button>
                <button className="btn btn--primary" type="button" disabled={busy || pin.length !== 4} onClick={() => void savePin()}>
                  {busy ? t.common.saving : t.common.save}
                </button>
              </div>
            </>
          )}
          {pinFor && (pins.has(pinFor.id) || savedPin) && <InviteBlock player={pinFor} tournament={tournament.name} slug={slug} pin={savedPin} />}
          {pinFor && lockOf(pinFor.id) && (
            <div className="stack" role="status">
              <p className={a.warn}>{P.pinLockedLine(lockOf(pinFor.id)!.failed, clockTime(lockOf(pinFor.id)!.lockedUntil))}</p>
              <button
                className="btn btn--secondary btn--sm"
                type="button"
                disabled={busy}
                onClick={async () => {
                  const id = pinFor.id
                  try {
                    await unlockPin(id)
                    setLocks((cur) => (cur ? cur.filter((l) => l.playerId !== id) : cur))
                    toast(P.pinUnlocked)
                  } catch (e) {
                    toast(humanError(e))
                  }
                }}
              >
                {P.unlockPin}
              </button>
            </div>
          )}
          {pinFor && phonesOf(phones, pinFor.id).length > 0 && (
            <section className="stack" aria-label={P.phones}>
              <span className="label">{P.phones}</span>
              <p className={a.help}>{P.phonesHelp}</p>
              <div className={a.rows}>
                {phonesOf(phones, pinFor.id).map((ph) => (
                  <div key={ph.id} className={a.row}>
                    <span className={a.rowText}>
                      <span className={a.rowTitle}>{P.phoneLine(ph.n, t.admin.history.kinds[ph.kind] ?? null, localWhen(ph.since, settings.timezone))}</span>
                    </span>
                    <button className="btn btn--ghost btn--sm" type="button" aria-label={P.removePhoneOf(ph.n)} onClick={() => setRemoving(ph)}>
                      {P.removePhone}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </Sheet>
    </div>
  )
}

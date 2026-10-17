/**
 * Torneo (§13): brand, status, banker, join code, every setting, and the
 * danger zone. Immediate mutations (status, banker, new code) show busy and
 * confirm where they can lock someone out.
 *
 * One route, six tabs. All of it used to render at once — past sixty controls
 * on a phone, the screen that earned "se necesita un doctorado" — so the
 * sections now take turns. The edited settings, the dirty flag and the one
 * Guardar live here and span every tab, so a rule changed under Reglas and a
 * prize changed under Dinero save together, exactly as before.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { CopyButton, Field, ShareButton, Toggle } from '../../components/ui'
import { toast } from '../../components/toast'
import { publishFromStore } from '../../data/publish'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Segmented } from '../../components/primitives'
import { deleteTournament, rotateJoinCode, setTournamentProtected, SettingsChanged, updateSettings, updateTournament, uploadAsset, type SetupFields, type SetupRow } from '../../data/api'
import { changedKeys, mergeOver, settingsWrite } from '../../data/settingsWrite'
import { OptionalNumberField } from '../../components/NumberField'
import { ReasonSheet } from '../../components/ReasonSheet'
import { useCloseGate } from '../../components/CloseGate'
import { useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { safeParseSettings, type TournamentSettings } from '../../engine/settings/schema'
import { readSettings } from '../../engine/settings/read'
import { checkPrizePool, fieldShape } from '../../engine/settings/prizeCheck'
import { settingsSense } from '../../engine/settings/sense'
import { LOGO_CACHE_SECONDS, logoPath, logoSize, prepareLogo } from '../../lib/logo'
import { TournamentLogo } from '../../components/TournamentLogo'
import { useWords } from '../../components/currency'
import { useTournamentCtx } from '../tournament/tournamentContext'
import { SettingsEditor } from './SettingsEditor'
import type { SettingsSection } from './SettingsEditor'
import { CrewField } from './CrewField'
import { ReadinessCard } from './ReadinessCard'
import { SpectatorLinkCard } from './SpectatorLinkCard'
import { AdultsCard } from './AdultsCard'
import { ACCENTS, DEFAULT_ACCENT, nearestAccent } from '../../design/accents'
import styles from './AdminTournament.module.css'
import a from './Admin.module.css'
import { humanError, UserError } from '../../lib/humanError'
import { handicapsLocked } from '../../engine/core/handicapLock'

const STATUSES = ['setup', 'auction', 'live', 'finished'] as const

/** The brand columns as the form shows them and a save writes them. */
interface Brand {
  name: string
  tagline: string | null
  accent_color: string
}
const BRAND_KEYS = ['name', 'tagline', 'accent_color'] as const
const brandOf = (name: string, tagline: string, accent: string): Brand => ({ name: name.trim(), tagline: tagline.trim() || null, accent_color: accent })

/**
 * What the editor started from (ARCH-13): the row's settings as fetched, the
 * same parsed, and the brand columns as stored (`seen`) and as the form showed
 * them (`form`). A row this build can't read never reaches the editor
 * (SettingsGuard, ARCH-04), and `settingsWrite` refuses one all the same.
 */
interface Start {
  raw: unknown
  parsed: TournamentSettings
  seen: SetupFields
  form: Brand
}
function startOf(tr: { name: string; tagline: string | null; accentColor?: string | null; settings: unknown }, parsed: TournamentSettings): Start {
  return {
    raw: tr.settings,
    parsed,
    seen: { name: tr.name, tagline: tr.tagline ?? null, accent_color: tr.accentColor ?? null },
    form: brandOf(tr.name, tr.tagline ?? '', tr.accentColor ?? DEFAULT_ACCENT.hex),
  }
}

/** The sub-nav. `brand` and `status` are tournament columns; the rest are settings. */
type Tab = 'brand' | 'status' | SettingsSection | 'danger'
const TABS: Array<{ id: Tab }> = [{ id: 'brand' }, { id: 'status' }, { id: 'rules' }, { id: 'games' }, { id: 'money' }, { id: 'auction' }, { id: 'danger' }]
const isSettingsTab = (x: Tab): x is SettingsSection => x === 'rules' || x === 'games' || x === 'money' || x === 'auction'
/** The tabs a link may open (`?pestana=`). */
const TAB_PARAM: Record<string, Tab> = { reglas: 'rules' }

export function AdminTournament() {
  const { tournamentId, slug, me, refresh } = useTournamentCtx()
  const [askUnprotect, setAskUnprotect] = useState(false)
  const data = useTournament((s) => s.data)
  const patch = useTournament((s) => s.patch)
  const navigate = useNavigate()
  const tr = data!.snapshot.tournament
  const [name, setName] = useState(tr.name)
  const [tagline, setTagline] = useState(tr.tagline ?? '')
  const [accent, setAccent] = useState(tr.accentColor ?? DEFAULT_ACCENT.hex)
  const [settings, setSettings] = useState<TournamentSettings>(data!.settings)
  const [dirty, setDirty] = useState(false)
  // A save says it saw this and writes only what changed since; the server refuses it when any of it moved meanwhile (0043).
  const start = useRef<Start>(startOf(tr, data!.settings))
  const [busy, setBusy] = useState(false)
  const [quick, setQuick] = useState(false)
  const [askCode, setAskCode] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  // «Para empezar» opens a tab by name (?pestana=reglas, where the days are). Read, then dropped, so the same line works again.
  const [params, setParams] = useSearchParams()
  const asked = TAB_PARAM[params.get('pestana') ?? ''] ?? null
  const [tab, setTab] = useState<Tab>(asked ?? 'brand')
  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!asked) return
    setTab(asked)
    tabsRef.current?.scrollIntoView?.({ block: 'start' })
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        q.delete('pestana')
        return q
      },
      { replace: true },
    )
  }, [asked, setParams])
  const fileRef = useRef<HTMLInputElement>(null)
  const A = t.admin.tournament
  const link = `${window.location.origin}/t/${slug}`
  // The planned field until the roster exists. With neither, the check runs on nobody: a pot that pays
  // nothing still saves, anything else waits for the number. Never the first tournament's 12 (ARCH-13, UX-16).
  const roster = data!.snapshot.players.length
  const players = roster || settings.expectedPlayers || 0
  const fieldKnown = players >= 2
  const words = useWords()
  const warnings = data!.state.flags.warnings.map(words)
  // Real group sizes per round, so the snake pot in the balance follows them (a group of 3 pays two).
  const groupSizes = useMemo(
    () => data!.snapshot.rounds.filter((r) => r.status !== 'cancelled').map((r) => data!.snapshot.groups.filter((g) => g.roundId === r.id).map((g) => g.playerIds.length)),
    [data],
  )

  // Follow realtime changes while nothing is being edited here.
  useEffect(() => {
    if (dirty) return
    setSettings(data!.settings)
    start.current = startOf(tr, data!.settings)
    setName(tr.name)
    setTagline(tr.tagline ?? '')
    setAccent(tr.accentColor ?? DEFAULT_ACCENT.hex)
  }, [data, dirty, tr, tr.name, tr.tagline, tr.accentColor])

  /*
   * Checking the settings means a full Zod parse of the schema plus the prize
   * check over the field. Running that synchronously on every keystroke is what
   * made the number fields feel stuck, so it trails the typing instead. What it
   * feeds is the balance bar and the save button — never a write (see `save`).
   */
  const checked = useDeferredValue(settings)
  const parsed = useMemo(() => safeParseSettings(checked), [checked])
  // Players, real group sizes and each side pot's entrants; the planned field size until the roster exists.
  const field = useMemo(() => ({ ...fieldShape(data!.snapshot, checked), players, groupSizes }), [data, checked, players, groupSizes])
  const check = useMemo(() => (parsed.success ? checkPrizePool(parsed.data, field) : null), [parsed, field])
  const balanced = check?.balanced ?? false
  // What parses but makes no sense (MONEY-13), on the draft and so on what is stored while nothing is typed.
  const sense = useMemo(() => (parsed.success ? settingsSense(parsed.data, fieldKnown ? field : null) : []), [parsed, field, fieldKnown])
  // Balanced, every paid place has someone who can take it (MONEY-09), and nothing that makes no sense.
  const savable = (check?.ok ?? false) && sense.length === 0

  async function save() {
    // Parse what is on screen right now: `parsed` is deferred and can be a
    // keystroke behind, and a save must never write a stale settings object.
    const fresh = safeParseSettings(settings)
    if (!fresh.success) return
    const freshField = { ...fieldShape(data!.snapshot, settings), players, groupSizes }
    if (!checkPrizePool(fresh.data, freshField).ok || settingsSense(fresh.data, fieldKnown ? freshField : null).length) return
    // Only what changed is written, and only while every key this screen read
    // still holds what it read: the prize check above read them all (ARCH-13).
    const from = start.current
    const brand = brandOf(name, tagline, accent)
    setBusy(true)
    try {
      // Refused over a row a newer build wrote (ARCH-04): writing it back as this build reads it would drop what it doesn't know.
      const write = settingsWrite(from.raw, from.parsed, fresh.data, { readAll: true })
      const set: SetupFields = { settings: write.set }
      for (const k of BRAND_KEYS) if (brand[k] !== from.form[k]) Object.assign(set, { [k]: brand[k] })
      landRow(await updateSettings(tournamentId, { settings: write.seen, ...from.seen }, set))
      setDirty(false)
      toast(t.common.saved)
    } catch (e) {
      if (e instanceof SettingsChanged) refused(e, fresh.data, brand)
      else toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  /** The row as the server holds it, onto the store's: what every screen reads. */
  function landRow(row: SetupRow) {
    patch((s) => {
      s.tournament.name = row.name
      s.tournament.tagline = row.tagline
      s.tournament.accentColor = row.accent_color
      s.tournament.settings = row.settings
    })
  }

  /**
   * Refused: another screen or phone saved meanwhile, and nothing was
   * written. The draft goes over the row as it is now: what only this screen
   * changed stays, everything else is theirs, and where both changed the
   * same thing theirs stays and the toast says so. Saving again sends it.
   */
  function refused(e: SettingsChanged, mine: TournamentSettings, brand: Brand) {
    const from = start.current
    landRow(e.now)
    const now = readSettings(e.now.settings)
    if (!now.ok) {
      // A newer build saved settings this one can't read (ARCH-04): the screen gives way to «Actualiza la app» (SettingsGuard).
      setDirty(false)
      toast(t.outdated.save)
      return
    }
    const next = startOf({ name: e.now.name, tagline: e.now.tagline, accentColor: e.now.accent_color, settings: e.now.settings }, now.settings)
    const s = mergeOver(from.parsed, mine, now.settings)
    const b = mergeOver(from.form, brand, next.form)
    start.current = next
    setSettings(s.merged)
    setName(b.merged.name)
    setTagline(b.merged.tagline ?? '')
    setAccent(b.merged.accent_color)
    setDirty(changedKeys(now.settings, s.merged).length > 0 || changedKeys(next.form, b.merged).length > 0)
    toast(s.lost.length || b.lost.length ? A.settingsMergedLost : A.settingsMerged)
  }

  /** The logo goes up as its rendition (PERF-01, PERF-16): its own new file, transparency kept. */
  async function onLogo(file: File, again = false) {
    setBusy(true)
    try {
      const prep = await prepareLogo(file)
      // Processing a stored logo again only helps if the browser could redraw it.
      if (again && prep.width == null) throw new UserError(t.errors.image)
      const url = await uploadAsset(logoPath(tournamentId, prep), prep.blob, prep.type, prep.width ? LOGO_CACHE_SECONDS : undefined)
      await updateTournament(tournamentId, { logo_url: url })
      patch((s) => (s.tournament.logoUrl = url))
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * A logo stored whole (before renditions, or seeded straight into Storage)
   * is read back and processed as if uploaded now. A URL of its own, so the
   * service worker's copy (an opaque one, from a plain <img>) is not what comes back.
   */
  async function optimizeLogo(url: string) {
    setBusy(true)
    let file: File
    try {
      const fresh = new URL(url)
      fresh.searchParams.set('polo-optimize', String(Date.now()))
      const res = await fetch(fresh.href, { cache: 'no-store' })
      if (!res.ok) throw new UserError(t.errors.image)
      const blob = await res.blob()
      file = new File([blob], 'logo', { type: blob.type })
    } catch (e) {
      toast(humanError(e))
      setBusy(false)
      return
    }
    await onLogo(file, true)
  }

  /** The immediate mutations: one busy flag, a toast on success; `recipe` applies the change to the local snapshot. */
  async function quickUpdate(fields: Record<string, unknown>, recipe: (s: Snapshot) => void) {
    setQuick(true)
    try {
      await updateTournament(tournamentId, fields)
      patch(recipe)
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setQuick(false)
    }
  }
  /** «Cerrar torneo» (MONEY-05): Terminado waits until nothing is left open. */
  const closeGate = useCloseGate(tournamentId)
  /** The state picked and not yet confirmed (A11Y-17). */
  const [askStatus, setAskStatus] = useState<(typeof STATUSES)[number] | null>(null)
  async function setStatus(status: (typeof STATUSES)[number]) {
    if (status === 'finished' && tr.status !== 'finished') return closeGate.guard({ confirmLabel: t.status.finished }, () => applyStatus(status))
    return applyStatus(status)
  }
  async function applyStatus(status: (typeof STATUSES)[number]) {
    await quickUpdate({ status }, (s) => (s.tournament.status = status))
    // Finished: the results go to the players' profiles (finish, points, awards, private net).
    if (status !== 'finished' || useTournament.getState().data?.snapshot.tournament.status !== 'finished') return
    try {
      const r = await publishFromStore(tournamentId)
      toast(A.published(r.players))
    } catch (e) {
      toast(`${A.publishFailed} ${humanError(e)}`)
    }
  }
  const setCounts = (v: boolean) => quickUpdate({ counts_for_stats: v }, (s) => (s.tournament.countsForStats = v))
  const setBanker = (id: string) => quickUpdate({ banker_player_id: id || null }, (s) => (s.tournament.bankerPlayerId = id || null))
  async function newCode() {
    setQuick(true)
    try {
      const code = await rotateJoinCode(tournamentId)
      patch((s) => (s.tournament.joinCode = code))
      toast(t.common.saved)
      setAskCode(false)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setQuick(false)
    }
  }

  async function protect() {
    setQuick(true)
    try {
      await setTournamentProtected(tournamentId, true)
      await refresh()
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setQuick(false)
    }
  }

  async function destroy() {
    if (confirmName !== tr.name) return
    setBusy(true)
    try {
      await deleteTournament(tournamentId)
      // The admin came from the panel; an organizer goes back to their list.
      navigate(me.via === 'platform' ? '/admin/torneos' : '/organizer', { replace: true })
    } catch (e) {
      toast(humanError(e))
      setBusy(false)
    }
  }

  return (
    <div className={a.screen}>
      <div className={a.head}>
        <h2>{t.admin.sections.tournament}</h2>
        {dirty && <span className={a.unsaved}>{A.unsaved}</span>}
      </div>
      {warnings.map((w) => (
        <p key={w} className={a.warn}>
          {w}
        </p>
      ))}
      <ReadinessCard />

      {/* The app's one in-page tab style, with its keys and its fades (VIS-17, VIS-26). */}
      <div ref={tabsRef}>
        <Segmented<Tab> value={tab} options={TABS.filter((x) => x.id !== 'auction' || settings.modules.auction.enabled).map((x) => ({ value: x.id, label: A.tabs[x.id] }))} onChange={setTab} tabs label={A.sections} />
      </div>

      {tab === 'brand' && (
      <section className={a.section}>
        <div className={a.sectionTitle}>
          <strong>{A.brand}</strong>
        </div>
        <div className={a.chipRow}>
          {tr.logoUrl ? <TournamentLogo url={tr.logoUrl} className={a.logo} /> : null}
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            {A.uploadLogo}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void onLogo(e.target.files[0])} />
        </div>
        {tr.logoUrl && !logoSize(tr.logoUrl) ? (
          <div className={a.chipRow}>
            <p className={a.help}>{A.logoHeavy}</p>
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => void optimizeLogo(tr.logoUrl!)} disabled={busy}>
              {A.optimizeLogo}
            </button>
          </div>
        ) : null}
        <Field label={A.name}>
          <input
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDirty(true)
            }}
          />
        </Field>
        <Field label={A.tagline}>
          <input
            className="input"
            value={tagline}
            onChange={(e) => {
              setTagline(e.target.value)
              setDirty(true)
            }}
          />
        </Field>
        <Field label={A.accent}>
          <div className={styles.swatches} role="group" aria-label={A.accent}>
            {ACCENTS.map((sw) => (
              <button
                key={sw.id}
                type="button"
                className={styles.swatch}
                aria-pressed={nearestAccent(accent).id === sw.id}
                data-accent={sw.id}
                onClick={() => {
                  setAccent(sw.hex)
                  setDirty(true)
                }}
              >
                <span className={styles.swatchDot} aria-hidden="true" />
                {sw.name}
              </button>
            ))}
          </div>
        </Field>
      </section>
      )}

      {tab === 'status' && (
      <section className={a.section}>
        <div className={a.sectionTitle}>
          <strong>{A.status}</strong>
          {quick && <span className={a.count}>{t.common.saving}</span>}
        </div>
        {/* A11Y-17: a choice, not tabs; moving it (a tap or an arrow key) asks before the tournament changes state. */}
        <Segmented
          value={tr.status}
          options={STATUSES.map((st) => ({ value: st, label: t.status[st] }))}
          onChange={(st) => (st === 'finished' ? void setStatus(st) : setAskStatus(st))}
          label={A.status}
          disabled={quick || closeGate.checking}
        />
        <ConfirmSheet
          open={askStatus !== null && askStatus !== tr.status}
          title={askStatus ? A.statusConfirmTitle(t.status[askStatus]) : ''}
          body={A.statusConfirmBody}
          busy={quick}
          onConfirm={() => {
            const st = askStatus
            setAskStatus(null)
            if (st) void setStatus(st)
          }}
          onClose={() => setAskStatus(null)}
        />
        {closeGate.sheet}
        {tr.status === 'setup' && !handicapsLocked(tr) && <p className={a.help}>{A.statusLocksHandicaps}</p>}
        <Toggle label={A.countsForStats} hint={A.countsForStatsHint} checked={tr.countsForStats !== false} onChange={(v) => void setCounts(v)} />
        <CrewField tournamentId={tournamentId} />
        <Field label={A.banker}>
          <select className="select" value={tr.bankerPlayerId ?? ''} disabled={quick} onChange={(e) => void setBanker(e.target.value)}>
            <option value="">{t.common.none}</option>
            {data!.snapshot.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </Field>
        <span className="label">{A.joinCode}</span>
        <div className={a.codeRow}>
          <span className={a.code}>{tr.joinCode}</span>
          <CopyButton text={tr.joinCode} />
          <button className="btn btn--ghost btn--sm" type="button" disabled={quick} onClick={() => setAskCode(true)}>
            {A.newCode}
          </button>
        </div>
        <span className="label">{A.link}</span>
        <span className={a.link}>{link}</span>
        <div className={a.chipRow}>
          <CopyButton text={link} />
          <ShareButton text={t.common.joinWithCode(tr.name, tr.joinCode)} url={link} title={tr.name} />
        </div>
      </section>
      )}
      {/* The link to watch without a PIN (STRAT-05): the TV's, and whoever else the Comité gives it to. */}
      {tab === 'status' && <SpectatorLinkCard />}

      {isSettingsTab(tab) && (
        <>
          {/* No roster yet: the field the check plans for comes first, before a balance that waits on it. */}
          {tab === 'money' && !roster && (
            <Field label={A.expectedPlayers} hint={A.expectedPlayersHint}>
              <OptionalNumberField
                label={A.expectedPlayers}
                min={2}
                max={200}
                value={settings.expectedPlayers ?? null}
                onChange={(v) => {
                  setSettings({ ...settings, expectedPlayers: v ?? undefined })
                  setDirty(true)
                }}
              />
            </Field>
          )}
          {/* Every player 18 or older, the Comité's word (TRUST-13): asked where the money is set. */}
          {tab === 'money' && <AdultsCard tournamentId={tournamentId} settings={parsed.success ? parsed.data : null} timeZone={data!.settings.timezone} />}
          <SettingsEditor
            value={settings}
            onChange={(v) => {
              setSettings(v)
              setDirty(true)
            }}
            field={field}
            section={tab}
          />
          {tab === 'money' && roster > 0 && (
            <p className={a.help}>
              {A.playersForCheck}: {players}
            </p>
          )}
        </>
      )}

      {/* One Guardar for every tab that edits: what is dirty saves together,
          and it follows unsaved work onto the tabs that don't edit. */}
      {(dirty || (tab !== 'danger' && tab !== 'status')) && (
        <div className={a.sticky}>
          {dirty && !parsed.success && <span className={a.error}>{A.invalidNearSave}</span>}
          {dirty && parsed.success && !(check?.ok ?? false) && !fieldKnown && <span className={a.error}>{A.fieldUnknownNearSave}</span>}
          {dirty && parsed.success && fieldKnown && !balanced && <span className={a.error}>{A.unbalancedNearSave}</span>}
          {dirty && parsed.success && fieldKnown && balanced && !(check?.ok ?? false) && <span className={a.error}>{A.unreachableNearSave}</span>}
          {sense.length > 0 && (
            <div className={a.error}>
              <span>{t.admin.sense.nearSave}</span>
              <ul>
                {sense.map((x) => (
                  <li key={`${x.key}:${x.text}`}>{x.text}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn btn--primary btn--block" type="button" disabled={busy || !dirty || !parsed.success || !savable} onClick={() => void save()}>
            {busy ? t.common.saving : t.common.save}
          </button>
        </div>
      )}

      {tab === 'danger' && (
        <>
          <section className={a.section}>
            <div className={a.sectionTitle}>
              <strong>{me.protected ? A.protectedTitle : A.unprotectedTitle}</strong>
            </div>
            <p className={a.help}>{me.protected ? A.protectedBody : A.unprotectedBody}</p>
            {me.protected ? (
              <button className="btn btn--secondary" type="button" onClick={() => setAskUnprotect(true)}>
                {A.unprotect}
              </button>
            ) : (
              <button className="btn btn--secondary" type="button" disabled={quick} onClick={() => void protect()}>
                {A.protect}
              </button>
            )}
          </section>
          {!me.protected && (
            <section className={a.danger}>
              <span className={a.dangerTitle}>{A.danger}</span>
              <p className={a.help}>{A.deleteConfirm(tr.name)}</p>
              <input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              <button className="btn btn--danger" type="button" disabled={busy || confirmName !== tr.name} onClick={() => void destroy()}>
                {A.deleteTournament}
              </button>
            </section>
          )}
        </>
      )}
      <ReasonSheet
        open={askUnprotect}
        title={A.unprotect}
        body={A.unprotectReason}
        confirmLabel={A.unprotect}
        danger
        onClose={() => setAskUnprotect(false)}
        onConfirm={async (reason) => {
          await setTournamentProtected(tournamentId, false, reason)
          await refresh()
        }}
      />

      <ConfirmSheet open={askCode} title={A.newCode} body={A.newCodeConfirm} busy={quick} onConfirm={() => void newCode()} onClose={() => setAskCode(false)} />
    </div>
  )
}

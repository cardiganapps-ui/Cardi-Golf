/**
 * Torneo (§13): brand, status, banker, join code, every setting, and the
 * danger zone. Immediate mutations (status, banker, new code) show busy and
 * confirm where they can lock someone out.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { CopyButton, Field, ShareButton, toast } from '../../components/ui'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { deleteTournament, updateTournament, uploadAsset } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { safeParseSettings, type TournamentSettings } from '../../engine/settings/schema'
import { downscaleImage } from '../../lib/images'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { SettingsEditor } from './SettingsEditor'
import { ACCENTS, DEFAULT_ACCENT, nearestAccent } from '../../design/accents'
import styles from './AdminTournament.module.css'
import a from './Admin.module.css'

const STATUSES = ['setup', 'auction', 'live', 'finished'] as const

export function AdminTournament() {
  const { tournamentId, slug } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const patch = useTournament((s) => s.patch)
  const navigate = useNavigate()
  const tr = data!.snapshot.tournament
  const [name, setName] = useState(tr.name)
  const [tagline, setTagline] = useState(tr.tagline ?? '')
  const [accent, setAccent] = useState(tr.accentColor ?? DEFAULT_ACCENT.hex)
  const [settings, setSettings] = useState<TournamentSettings>(data!.settings)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [quick, setQuick] = useState(false)
  const [askCode, setAskCode] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const A = t.admin.tournament
  const link = `${window.location.origin}/t/${slug}`
  const players = data!.snapshot.players.length || 12
  const warnings = data!.state.flags.warnings

  useEffect(() => {
    if (!dirty) setSettings(data!.settings)
  }, [data, dirty])

  const parsed = useMemo(() => safeParseSettings(settings), [settings])

  async function save() {
    if (!parsed.success) return
    setBusy(true)
    try {
      await updateTournament(tournamentId, { name: name.trim(), tagline: tagline.trim() || null, accent_color: accent, settings: parsed.data })
      patch((s) => {
        s.tournament.name = name.trim()
        s.tournament.tagline = tagline.trim() || null
        s.tournament.accentColor = accent
        s.tournament.settings = parsed.data
      })
      setDirty(false)
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onLogo(file: File) {
    setBusy(true)
    try {
      const { blob, type } = await downscaleImage(file, 800)
      const ext = type === 'image/png' ? 'png' : 'jpg'
      const url = await uploadAsset(`${tournamentId}/logo.${ext}`, blob, type)
      await updateTournament(tournamentId, { logo_url: url })
      patch((s) => (s.tournament.logoUrl = url))
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** The immediate mutations: one busy flag, a toast on success. */
  async function quickUpdate(fields: Record<string, unknown>, apply: () => void) {
    setQuick(true)
    try {
      await updateTournament(tournamentId, fields)
      patch(() => apply())
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setQuick(false)
    }
  }
  const setStatus = (status: (typeof STATUSES)[number]) => quickUpdate({ status }, () => patch((s) => (s.tournament.status = status)))
  const setBanker = (id: string) => quickUpdate({ banker_player_id: id || null }, () => patch((s) => (s.tournament.bankerPlayerId = id || null)))
  async function newCode() {
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
    await quickUpdate({ join_code: code }, () => patch((s) => (s.tournament.joinCode = code)))
    setAskCode(false)
  }

  async function destroy() {
    if (confirmName !== tr.name) return
    setBusy(true)
    try {
      await deleteTournament(tournamentId)
      navigate('/organizer', { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
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

      <section className={a.section}>
        <div className={a.sectionTitle}>
          <strong>{A.brand}</strong>
        </div>
        <div className={a.chipRow}>
          {tr.logoUrl ? <img src={tr.logoUrl} alt="" className={a.logo} /> : null}
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            {A.uploadLogo}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void onLogo(e.target.files[0])} />
        </div>
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
                style={{ '--swatch': sw.hex } as React.CSSProperties}
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

      <section className={a.section}>
        <div className={a.sectionTitle}>
          <strong>{A.status}</strong>
          {quick && <span className={a.count}>{t.common.saving}</span>}
        </div>
        <div className="segmented" role="tablist" aria-busy={quick}>
          {STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tr.status === s} disabled={quick} onClick={() => void setStatus(s)}>
              {t.status[s]}
            </button>
          ))}
        </div>
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

      <SettingsEditor
        value={settings}
        onChange={(v) => {
          setSettings(v)
          setDirty(true)
        }}
        players={players}
      />
      <p className={a.help}>
        {A.playersForCheck}: {players}
      </p>

      <div className={a.sticky}>
        {dirty && !parsed.success && <span className={a.error}>{A.invalidNearSave}</span>}
        <button className="btn btn--primary btn--block" type="button" disabled={busy || !dirty || !parsed.success} onClick={() => void save()}>
          {busy ? t.common.saving : t.common.save}
        </button>
      </div>

      <section className={a.danger}>
        <span className={a.dangerTitle}>{A.danger}</span>
        <p className={a.help}>{A.deleteConfirm(tr.name)}</p>
        <input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        <button className="btn btn--danger" type="button" disabled={busy || confirmName !== tr.name} onClick={() => void destroy()}>
          {A.deleteTournament}
        </button>
      </section>

      <ConfirmSheet open={askCode} title={A.newCode} body={A.newCodeConfirm} busy={quick} onConfirm={() => void newCode()} onClose={() => setAskCode(false)} />
    </div>
  )
}

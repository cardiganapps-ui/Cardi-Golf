import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { CopyButton, Field, ShareButton, toast } from '../../components/ui'
import { deleteTournament, updateTournament, uploadAsset } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { safeParseSettings, type TournamentSettings } from '../../engine/settings/schema'
import { downscaleImage } from '../../lib/images'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { SettingsEditor } from './SettingsEditor'
import { ACCENTS, DEFAULT_ACCENT, nearestAccent } from '../../design/accents'
import styles from './AdminTournament.module.css'

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
  const [confirmName, setConfirmName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const A = t.admin.tournament
  const link = `${window.location.origin}/t/${slug}`

  useEffect(() => {
    if (!dirty) setSettings(data!.settings)
  }, [data, dirty])

  const parsed = useMemo(() => safeParseSettings(settings), [settings])

  async function save(extra: Record<string, unknown> = {}) {
    if (!parsed.success) return
    setBusy(true)
    try {
      await updateTournament(tournamentId, { name: name.trim(), tagline: tagline.trim() || null, accent_color: accent, settings: parsed.data, ...extra })
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

  async function setStatus(status: (typeof STATUSES)[number]) {
    try {
      await updateTournament(tournamentId, { status })
      patch((s) => (s.tournament.status = status))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function setBanker(id: string) {
    try {
      await updateTournament(tournamentId, { banker_player_id: id || null })
      patch((s) => (s.tournament.bankerPlayerId = id || null))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function newCode() {
    // Let Postgres pick: set to a fresh value via the generator.
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
    try {
      await updateTournament(tournamentId, { join_code: code })
      patch((s) => (s.tournament.joinCode = code))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
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
    <div className="stack stack--lg">
      <section className="card stack">
        <span className="label">{A.brand}</span>
        <div className="row">
          {tr.logoUrl ? <img src={tr.logoUrl} alt="" style={{ width: 72, height: 72, objectFit: 'contain' }} /> : null}
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
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.swatch}
                aria-pressed={nearestAccent(accent).id === a.id}
                style={{ '--swatch': a.hex } as React.CSSProperties}
                onClick={() => {
                  setAccent(a.hex)
                  setDirty(true)
                }}
              >
                <span className={styles.swatchDot} aria-hidden="true" />
                {a.name}
              </button>
            ))}
          </div>
        </Field>
      </section>

      <section className="card card--cell stack">
        <span className="label">{A.status}</span>
        <div className="segmented" role="tablist">
          {STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tr.status === s} onClick={() => void setStatus(s)}>
              {t.status[s]}
            </button>
          ))}
        </div>
        <Field label={A.banker}>
          <select className="select" value={tr.bankerPlayerId ?? ''} onChange={(e) => void setBanker(e.target.value)}>
            <option value="">{t.common.none}</option>
            {data!.snapshot.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </Field>
        <span className="label">{A.joinCode}</span>
        <div className="row row--wrap">
          <span className="num" style={{ fontSize: '1.8rem', letterSpacing: '0.2em' }}>
            {tr.joinCode}
          </span>
          <CopyButton text={tr.joinCode} />
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => void newCode()}>
            {A.newCode}
          </button>
        </div>
        <span className="label">{A.link}</span>
        <div className="row row--wrap">
          <span className="small" style={{ wordBreak: 'break-all' }}>
            {link}
          </span>
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
        players={data!.snapshot.players.length || 12}
      />
      <p className="help">
        {A.playersForCheck}: {data!.snapshot.players.length || 12}
      </p>

      <div style={{ position: 'sticky', bottom: 12, zIndex: 4 }}>
        <button className="btn btn--primary btn--block" type="button" disabled={busy || !dirty || !parsed.success} onClick={() => void save()}>
          {busy ? t.common.saving : t.common.save}
        </button>
      </div>

      <section className="card stack" style={{ borderLeft: '4px solid var(--coral)' }}>
        <span className="label coral">{A.danger}</span>
        <p className="help">{A.deleteConfirm(tr.name)}</p>
        <input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        <button className="btn btn--danger" type="button" disabled={busy || confirmName !== tr.name} onClick={() => void destroy()}>
          {A.deleteTournament}
        </button>
      </section>
    </div>
  )
}

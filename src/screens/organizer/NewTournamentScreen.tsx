import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { CopyButton, Field, ShareButton } from '../../components/ui'
import { useAuth } from '../../data/auth'
import { createTournament } from '../../data/api'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../../engine/settings/presets'
import type { TournamentSettings } from '../../engine/settings/schema'
import { SettingsEditor } from '../admin/SettingsEditor'
import { checkPrizePool } from '../../engine/settings/prizeCheck'
import { safeParseSettings } from '../../engine/settings/schema'

type Step = 1 | 2 | 3 | 4

export function NewTournamentScreen() {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [template, setTemplate] = useState<'full' | 'minimal'>('full')
  const [players, setPlayers] = useState(12)
  const [settings, setSettings] = useState<TournamentSettings>(structuredClone(FIRST_TOURNAMENT_SETTINGS))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ slug: string; joinCode: string } | null>(null)

  useEffect(() => {
    if (ready && (!user || isAnonymous)) navigate('/organizer/login', { replace: true })
  }, [ready, user, isAnonymous, navigate])

  useEffect(() => {
    setSettings(structuredClone(template === 'full' ? FIRST_TOURNAMENT_SETTINGS : DEFAULT_SETTINGS))
    setPlayers(template === 'full' ? 12 : 8)
  }, [template])

  const parsed = useMemo(() => safeParseSettings(settings), [settings])
  const check = useMemo(() => (parsed.success ? checkPrizePool(parsed.data, { players }) : null), [parsed, players])

  async function create() {
    if (!parsed.success) return
    setBusy(true)
    setError(null)
    try {
      const row = await createTournament({ name: name.trim(), tagline: tagline.trim() || undefined, settings: parsed.data })
      setCreated({ slug: row.slug, joinCode: row.joinCode })
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const steps = [t.organizer.wizard.step1, t.organizer.wizard.step2, t.organizer.wizard.step3, t.organizer.wizard.step4]
  const link = created ? `${window.location.origin}/t/${created.slug}` : ''

  return (
    <div className="screen">
      <Link to="/organizer" style={{ textDecoration: 'none' }}>
        <Wordmark />
      </Link>
      <h1>{t.organizer.wizard.title}</h1>
      <ol className="row row--wrap" style={{ listStyle: 'none', padding: 0, gap: 8 }}>
        {steps.map((s, i) => (
          <li key={s} className={`chip ${i + 1 === step ? 'chip--teal' : i + 1 < step ? 'chip--sun' : 'chip--outline'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="stack">
          <Field label={t.organizer.wizard.name}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.organizer.wizard.namePlaceholder} autoFocus />
          </Field>
          <Field label={t.organizer.wizard.tagline}>
            <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={t.organizer.wizard.taglinePlaceholder} />
          </Field>
          <button className="btn btn--primary" type="button" disabled={name.trim().length < 3} onClick={() => setStep(2)}>
            {t.common.next}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <span className="label">{t.organizer.wizard.template}</span>
          {(
            [
              ['full', t.organizer.wizard.templateFull, t.organizer.wizard.templateFullHint],
              ['minimal', t.organizer.wizard.templateMinimal, t.organizer.wizard.templateMinimalHint],
            ] as const
          ).map(([v, label, hint]) => (
            <button
              key={v}
              type="button"
              className={`card ${template === v ? '' : 'card--cell'}`}
              style={{ textAlign: 'left', border: template === v ? '2px solid var(--teal)' : '2px solid transparent', cursor: 'pointer' }}
              onClick={() => setTemplate(v)}
            >
              <strong>{label}</strong>
              <p className="help">{hint}</p>
            </button>
          ))}
          <div className="row">
            <button className="btn btn--secondary" type="button" onClick={() => setStep(1)}>
              {t.common.back}
            </button>
            <button className="btn btn--primary grow" type="button" onClick={() => setStep(3)}>
              {t.common.next}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <Field label={t.organizer.wizard.players}>
            <input className="input input--num" type="number" min={2} max={200} value={players} onChange={(e) => setPlayers(Number(e.target.value) || 0)} />
          </Field>
          <SettingsEditor value={settings} onChange={setSettings} players={players} compact />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn btn--secondary" type="button" onClick={() => setStep(2)}>
              {t.common.back}
            </button>
            <button className="btn btn--primary grow" type="button" disabled={busy || !parsed.success || !check?.balanced} onClick={create}>
              {t.organizer.wizard.create}
            </button>
          </div>
        </div>
      )}

      {step === 4 && created && (
        <div className="stack stack--lg fade-in">
          <div className="card card--deep">
            <h2>{t.organizer.wizard.created}</h2>
            <p className="muted">{t.organizer.wizard.shareHint}</p>
            <p className="num" style={{ fontSize: '2.6rem', letterSpacing: '0.2em', margin: '12px 0' }}>
              {created.joinCode}
            </p>
            <p className="small" style={{ wordBreak: 'break-all' }}>
              {link}
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <CopyButton text={link} label={t.organizer.link} />
              <CopyButton text={created.joinCode} label={t.organizer.joinCode} />
              <ShareButton text={t.common.joinWithCode(name, created.joinCode)} url={link} title={name} />
            </div>
          </div>
          <Link className="btn btn--primary btn--block" to={`/t/${created.slug}/admin`}>
            {t.organizer.wizard.goAdmin}
          </Link>
        </div>
      )}
    </div>
  )
}

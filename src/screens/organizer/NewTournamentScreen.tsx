/**
 * Nuevo torneo: four short steps. Name, then the games, then a summary of the
 * money (adjustable), then the code to share. Defaults carry the organizer.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { CopyButton, Field, ShareButton } from '../../components/ui'
import { IconCheck } from '../../components/icons'
import { useAuth } from '../../data/auth'
import { createTournament } from '../../data/api'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../../engine/settings/presets'
import type { TournamentSettings } from '../../engine/settings/schema'
import { SettingsEditor } from '../admin/SettingsEditor'
import { PrizeSummary } from '../admin/PrizeSummary'
import { checkPrizePool } from '../../engine/settings/prizeCheck'
import { safeParseSettings } from '../../engine/settings/schema'
import { formatMoney } from '../../lib/money'
import styles from './Organizer.module.css'

type Step = 1 | 2 | 3 | 4
const TOTAL_STEPS = 4

export function NewTournamentScreen() {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [template, setTemplate] = useState<'full' | 'minimal'>('full')
  const [players, setPlayers] = useState(12)
  const [settings, setSettings] = useState<TournamentSettings>(structuredClone(FIRST_TOURNAMENT_SETTINGS))
  const [adjusting, setAdjusting] = useState(false)
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
  const W = t.organizer.wizard
  const stepNames = [W.step1, W.step2, W.step3, W.step4]
  const enabledModules = Object.values(settings.modules)
    .filter((m) => m.enabled)
    .map((m) => m.label)

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

  const link = created ? `${window.location.origin}/t/${created.slug}` : ''

  return (
    <div className={styles.screen}>
      <Link to="/organizer" className={styles.brand}>
        <Wordmark />
      </Link>
      <div className={styles.progress}>
        <h1>{step === 4 ? W.created : W.title}</h1>
        <div className={styles.progressBar} aria-hidden="true">
          {stepNames.map((s, i) => (
            <span key={s} className={`${styles.progressSeg} ${i + 1 <= step ? styles.progressDone : ''}`} />
          ))}
        </div>
        <span className={styles.progressText}>
          {W.stepOf(step, TOTAL_STEPS)}, <strong>{stepNames[step - 1]}</strong>
        </span>
      </div>

      {step === 1 && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length >= 3) setStep(2)
          }}
        >
          <Field label={W.name}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={W.namePlaceholder} autoFocus />
          </Field>
          <Field label={W.tagline}>
            <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={W.taglinePlaceholder} />
          </Field>
          <button className="btn btn--primary" type="submit" disabled={name.trim().length < 3}>
            {t.common.next}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className={styles.form}>
          <div className={styles.choices} role="radiogroup" aria-label={W.template}>
            {(
              [
                ['full', W.templateFull, W.templateFullHint],
                ['minimal', W.templateMinimal, W.templateMinimalHint],
              ] as const
            ).map(([v, label, hint]) => (
              <button key={v} type="button" role="radio" aria-checked={template === v} className={styles.choice} onClick={() => setTemplate(v)}>
                <span className={styles.choiceText}>
                  <span className={styles.choiceTitle}>{label}</span>
                  <span className={styles.choiceHint}>{hint}</span>
                </span>
                {template === v && (
                  <span className={styles.choiceMark}>
                    <IconCheck />
                  </span>
                )}
              </button>
            ))}
          </div>
          <Field label={W.players}>
            <input className="input input--num" type="number" min={2} max={200} value={players} onChange={(e) => setPlayers(Number(e.target.value) || 0)} />
          </Field>
          <div className={styles.actions}>
            <button className="btn btn--secondary" type="button" onClick={() => setStep(1)}>
              {t.common.back}
            </button>
            <button className="btn btn--primary" type="button" disabled={players < 2} onClick={() => setStep(3)}>
              {t.common.next}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={styles.form}>
          <div className={styles.summary}>
            <div className={styles.summaryLines}>
              <SummaryLine k={W.step1} v={name.trim()} />
              <SummaryLine k={W.template} v={template === 'full' ? W.templateFull : W.templateMinimal} />
              <SummaryLine k={W.modulesOn} v={enabledModules.join(', ')} />
              <SummaryLine k={t.live.players} v={W.playersLine(players)} />
              <SummaryLine k={t.money.entryFee} v={W.entryLine(formatMoney(settings.entryFee), formatMoney(settings.entryFee * players))} />
            </div>
            <span className="label">{t.money.prizes}</span>
            <PrizeSummary check={check} players={players} issues={parsed.success ? undefined : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)} />
          </div>
          <button className="btn btn--ghost" type="button" aria-expanded={adjusting} onClick={() => setAdjusting((a) => !a)}>
            {adjusting ? W.hideAdjust : W.adjust}
          </button>
          {adjusting && <SettingsEditor value={settings} onChange={setSettings} players={players} compact />}
          {error && <p className="error">{error}</p>}
          <div className={styles.actions}>
            <button className="btn btn--secondary" type="button" onClick={() => setStep(2)}>
              {t.common.back}
            </button>
            <button className="btn btn--primary" type="button" disabled={busy || !parsed.success || !check?.balanced} onClick={create}>
              {busy ? W.creating : W.create}
            </button>
          </div>
        </div>
      )}

      {step === 4 && created && (
        <div className={`${styles.created} fade-in`}>
          <span className="label">{t.organizer.joinCode}</span>
          <span className={styles.bigCode}>{created.joinCode}</span>
          <span className={styles.link}>{link}</span>
          <p className="help">{W.shareHint}</p>
          <div className={styles.shareRow}>
            <CopyButton text={link} label={t.organizer.link} />
            <CopyButton text={created.joinCode} label={t.organizer.joinCode} />
            <ShareButton text={t.common.joinWithCode(name, created.joinCode)} url={link} title={name} />
          </div>
          <Link className="btn btn--primary btn--block" to={`/t/${created.slug}/admin`}>
            {W.goAdmin}
          </Link>
        </div>
      )}
    </div>
  )
}

function SummaryLine({ k, v }: { k: string; v: string }) {
  return (
    <div className={styles.summaryLine}>
      <span className={styles.summaryKey}>{k}</span>
      <span className={styles.summaryValue}>{v}</span>
    </div>
  )
}

/**
 * Nuevo torneo: five short steps. Name; the format (a starting preset plus
 * days, field, groups, handicap, tiers); the game catalog; the money with a
 * live balance bar; and the code to share. Every choice stays editable later
 * in Comité, Torneo.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { CopyButton, Field, ShareButton } from '../../components/ui'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { IconCheck } from '../../components/icons'
import { useAuth } from '../../data/auth'
import { createTournament } from '../../data/api'
import { PRESETS, type PresetId } from '../../engine/games/presets'
import type { TournamentSettings } from '../../engine/settings/schema'
import { checkPrizePool } from '../../engine/settings/prizeCheck'
import { safeParseSettings } from '../../engine/settings/schema'
import { FormatEditor } from './setup/FormatEditor'
import { GameCatalog } from './setup/GameCatalog'
import { MoneyBar, MoneyEditor } from './setup/MoneyEditor'
import styles from './Organizer.module.css'

type Step = 1 | 2 | 3 | 4 | 5
const TOTAL_STEPS = 5

export function NewTournamentScreen() {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [preset, setPreset] = useState<PresetId>('friends')
  const [askPreset, setAskPreset] = useState<PresetId | null>(null)
  const [players, setPlayers] = useState(PRESETS[0]!.players)
  const [settings, setSettings] = useState<TournamentSettings>(() => PRESETS[0]!.build())
  const [pristine, setPristine] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ slug: string; joinCode: string } | null>(null)

  useEffect(() => {
    if (ready && (!user || isAnonymous)) navigate('/organizer/login', { replace: true })
  }, [ready, user, isAnonymous, navigate])

  const edit = (s: TournamentSettings) => {
    setSettings(s)
    setPristine(false)
  }
  const applyPreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!
    setPreset(id)
    setSettings(p.build())
    setPlayers(p.players)
    setPristine(true)
    setAskPreset(null)
  }

  const field = useMemo(() => ({ players }), [players])
  const parsed = useMemo(() => safeParseSettings(settings), [settings])
  const check = useMemo(() => (parsed.success ? checkPrizePool(parsed.data, field) : null), [parsed, field])
  const W = t.organizer.wizard
  const stepNames = [W.step1, W.step2, W.step3, W.step4, W.step5]

  async function create() {
    if (!parsed.success) return
    setBusy(true)
    setError(null)
    try {
      const row = await createTournament({ name: name.trim(), tagline: tagline.trim() || undefined, settings: { ...parsed.data, expectedPlayers: players } })
      setCreated({ slug: row.slug, joinCode: row.joinCode })
      setStep(5)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const nav = (back: Step, next: Step | null, nextLabel: string = t.common.next, disabled = false, onNext?: () => void) => (
    <div className={styles.actions}>
      <button className="btn btn--secondary" type="button" onClick={() => setStep(back)}>
        {t.common.back}
      </button>
      <button className="btn btn--primary" type="button" disabled={disabled} onClick={() => (onNext ? onNext() : next && setStep(next))}>
        {nextLabel}
      </button>
    </div>
  )

  const link = created ? `${window.location.origin}/t/${created.slug}` : ''

  return (
    <div className={styles.screen}>
      <Link to="/organizer" className={styles.brand}>
        <Wordmark />
      </Link>
      <div className={styles.progress}>
        <h1>{step === 5 ? W.created : W.title}</h1>
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
          <div className="stack">
            <span className="label">{W.template}</span>
            <span className="help">{W.templateHint}</span>
            <div className={styles.choices} role="radiogroup" aria-label={W.template}>
              {PRESETS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={styles.choice} onClick={() => (p.id === preset ? undefined : pristine ? applyPreset(p.id) : setAskPreset(p.id))}>
                  <span className={styles.choiceText}>
                    <span className={styles.choiceTitle}>{p.name}</span>
                    <span className={styles.choiceHint}>{p.blurb}</span>
                  </span>
                  {preset === p.id && (
                    <span className={styles.choiceMark}>
                      <IconCheck />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <FormatEditor value={settings} onChange={edit} players={players} onPlayers={setPlayers} />
          {nav(1, 3, t.common.next, players < 2)}
        </div>
      )}

      {step === 3 && (
        <div className={styles.form}>
          <GameCatalog value={settings} onChange={edit} />
          {nav(2, 4)}
        </div>
      )}

      {step === 4 && (
        <div className={styles.form}>
          <MoneyEditor value={settings} onChange={edit} field={field} />
          {error && <p className="error">{error}</p>}
          {(!parsed.success || !check?.balanced) && <p className="help">{W.fixToCreate}</p>}
          <MoneyBar value={settings} field={field} />
          {nav(3, null, busy ? W.creating : W.create, busy || !parsed.success || !check?.balanced, () => void create())}
        </div>
      )}

      <ConfirmSheet open={!!askPreset} title={W.replaceTitle} body={W.replaceBody} confirmLabel={W.replaceConfirm} onConfirm={() => askPreset && applyPreset(askPreset)} onClose={() => setAskPreset(null)} />

      {step === 5 && created && (
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

/**
 * Nuevo torneo in three steps: what it is called, what they are playing, and
 * a look at it before it exists.
 *
 * It used to be five, and the middle three were a wall: five preset cards
 * plus days, field, groups, allowance and tiers; then fifteen game cards over
 * six headings; then every peso. Almost none of that has to be decided before
 * the first tee, and all of it stays editable in Comité — so it moved there,
 * and what is left is the handful of answers a tournament cannot start
 * without.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { CopyButton, Field, ShareButton } from '../../components/ui'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { useAuth } from '../../data/auth'
import { createTournament } from '../../data/api'
import { PRESETS, type PresetId } from '../../engine/games/presets'
import type { TournamentSettings } from '../../engine/settings/schema'
import { checkPrizePool } from '../../engine/settings/prizeCheck'
import { safeParseSettings } from '../../engine/settings/schema'
import { PlayStep } from './setup/PlayStep'
import { formatFor } from '../../engine/formats'
import { formatMoney } from '../../lib/money'
import styles from './Organizer.module.css'
import { humanError } from '../../lib/humanError'

const BLANK = PRESETS.find((p) => p.id === 'blank')!

type Step = 1 | 2 | 3
const TOTAL_STEPS = 3
/** The success screen is an outcome, not a fourth step. */
const DONE = 4 as const

/**
 * `demo` is the design fixture (`/organizer/nuevo/_`, preview builds only):
 * the same wizard with no account and no write, so the setup flow can be
 * looked at — and screenshotted — without creating a real tournament.
 */
export function NewTournamentScreen({ demo = false }: { demo?: boolean } = {}) {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const [step, setStep] = useState<Step | typeof DONE>(1)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [askPreset, setAskPreset] = useState<PresetId | null>(null)
  // A new tournament starts blank, not on a template: four games already
  // ticked is exactly the "demasiados prellenados" the setup was rebuilt for.
  // Templates are still one tap away, behind "¿Prefieres empezar de una
  // plantilla?" on step 2.
  const [players, setPlayers] = useState(BLANK.players)
  const [settings, setSettings] = useState<TournamentSettings>(() => BLANK.build())
  const [pristine, setPristine] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ slug: string; joinCode: string } | null>(null)

  useEffect(() => {
    if (!demo && ready && (!user || isAnonymous)) navigate('/organizer/login', { replace: true })
  }, [demo, ready, user, isAnonymous, navigate])

  const edit = (s: TournamentSettings) => {
    setSettings(s)
    setPristine(false)
  }
  const applyPreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!
    setSettings(p.build())
    setPlayers(p.players)
    setPristine(true)
    setAskPreset(null)
  }

  const field = useMemo(() => ({ players }), [players])
  const parsed = useMemo(() => safeParseSettings(settings), [settings])
  const check = useMemo(() => (parsed.success ? checkPrizePool(parsed.data, field) : null), [parsed, field])
  const W = t.organizer.wizard
  const stepNames = [W.step1, W.step2, W.review]

  async function create() {
    if (!parsed.success) return
    setBusy(true)
    setError(null)
    try {
      // The organizer's own zone, not the platform's placeholder.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || parsed.data.timezone
      const row = demo ? { slug: 'ejemplo', joinCode: 'EJEMPL' } : await createTournament({ name: name.trim(), tagline: tagline.trim() || undefined, settings: { ...parsed.data, timezone, expectedPlayers: players } })
      setCreated({ slug: row.slug, joinCode: row.joinCode })
      setStep(DONE)
    } catch (e) {
      setError(humanError(e))
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
        <h1>{step === DONE ? W.created : W.title}</h1>
        <div className={styles.progressBar} aria-hidden="true">
          {stepNames.map((s, i) => (
            <span key={s} className={`${styles.progressSeg} ${i + 1 <= step ? styles.progressDone : ''}`} />
          ))}
        </div>
        <span className={styles.progressText}>
          {W.stepOf(Math.min(step, TOTAL_STEPS), TOTAL_STEPS)}, <strong>{stepNames[Math.min(step, TOTAL_STEPS) - 1]}</strong>
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
            {/* No autoFocus: the keyboard covering the screen you just opened is not a welcome. */}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={W.namePlaceholder} />
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
          <PlayStep value={settings} onChange={edit} players={players} onPlayers={setPlayers} onPreset={(id) => (pristine ? applyPreset(id) : setAskPreset(id))} />
          {nav(1, 3, t.common.next, players < 2)}
        </div>
      )}

      {step === 3 && (
        <div className={styles.form}>
          <ReviewCard name={name} tagline={tagline} settings={settings} players={players} />
          {error && <p className="error">{error}</p>}
          {(!parsed.success || !check?.balanced) && <p className="help">{W.fixToCreate}</p>}
          {nav(2, null, busy ? W.creating : W.create, busy || !parsed.success || !check?.balanced, () => void create())}
        </div>
      )}

      <ConfirmSheet open={!!askPreset} title={W.replaceTitle} body={W.replaceBody} confirmLabel={W.replaceConfirm} onConfirm={() => askPreset && applyPreset(askPreset)} onClose={() => setAskPreset(null)} />

      {step === DONE && created && (
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

/**
 * What you are about to create, in plain lines. The wizard used to create the
 * tournament straight off the money step, with no moment to look at the thing
 * before it existed — these strings were written for this card and then left
 * unused in `es-MX.ts`.
 */
function ReviewCard({ name, tagline, settings, players }: { name: string; tagline: string; settings: TournamentSettings; players: number }) {
  const W = t.organizer.wizard
  const format = formatFor(settings)
  const games = settings.games.filter((g) => g.enabled).map((g) => g.label)
  const rows: Array<[string, string]> = [
    [W.name, name.trim()],
    // The tagline is its own line, not «name · tagline».
    ...(tagline.trim() ? [[t.admin.tournament.tagline, tagline.trim()] as [string, string]] : []),
    [W.reviewFormat, `${format.defaultLabel}, ${format.figureLabel(settings).toLowerCase()}`],
    [W.rounds, `${W.reviewDays(settings.rounds)}, ${W.reviewField(players)}`],
    [W.money, settings.entryFee > 0 ? W.reviewMoney(formatMoney(settings.entryFee), formatMoney(settings.entryFee * players)) : W.reviewNoMoney],
    [W.quickGames, W.reviewGames(games)],
  ]
  return (
    <div className="stack">
      <span className="label">{W.review}</span>
      <div className={styles.review}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.reviewRow}>
            <span className={styles.reviewKey}>{k}</span>
            <span className={styles.reviewValue}>{v}</span>
          </div>
        ))}
      </div>
      <p className="help">{W.reviewHint}</p>
    </div>
  )
}

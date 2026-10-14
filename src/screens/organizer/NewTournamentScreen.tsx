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
 *
 * The step is in the address (`?paso=2`), one history entry per step
 * forward, so the system back goes back a step and forward returns (UX-05):
 * the step used to be component state, and the back gesture left the wizard
 * with everything typed. What is typed is kept in this tab's sessionStorage
 * (`wizardDraft.ts`), and leaving the wizard with something typed asks first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useSearchParams, type BlockerFunction } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { IconChevronRight } from '../../components/icons'
import { CopyButton, Field, ShareButton } from '../../components/ui'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { leaveSheetHistory } from '../../components/sheetHistory'
import { useAuth } from '../../data/auth'
import { createTournament, upsertRound } from '../../data/api'
import { PRESETS, type PresetId } from '../../engine/games/presets'
import type { TournamentSettings } from '../../engine/settings/schema'
import { checkPrizePool } from '../../engine/settings/prizeCheck'
import { settingsSense } from '../../engine/settings/sense'
import { safeParseSettings } from '../../engine/settings/schema'
import { PlayStep } from './setup/PlayStep'
import { ReviewCard } from './setup/ReviewCard'
import styles from './Organizer.module.css'
import { humanError } from '../../lib/humanError'
import { clearDraft, draftKey, readDraft, writeDraft } from './wizardDraft'

const BLANK = PRESETS.find((p) => p.id === 'blank')!
/** The blank settings as the schema reads them, to tell a draft from an untouched wizard. */
const BLANK_SETTINGS = JSON.stringify(safeParseSettings(BLANK.build()).data)

type Step = 1 | 2 | 3
const TOTAL_STEPS = 3
/** The success screen is an outcome, not a fourth step. */
const DONE = 4 as const
const STEP_PARAM = 'paso'
/** On a step's history entry: it was pushed from the step before, so «Atrás» can be the system back. */
const FROM_STEP = 'wizardStep'

const stepOf = (v: string | null): Step => (v === '2' ? 2 : v === '3' ? 3 : 1)
function withStep(params: URLSearchParams, step: Step): URLSearchParams {
  const next = new URLSearchParams(params)
  if (step === 1) next.delete(STEP_PARAM)
  else next.set(STEP_PARAM, String(step))
  return next
}
/** The router's index of the current history entry (a sheet's own entry copies it). */
function historyIndex(): number | undefined {
  try {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx
    return typeof idx === 'number' ? idx : undefined
  } catch {
    return undefined
  }
}

/**
 * `demo` is the design fixture (`/organizer/nuevo/_`, preview builds only):
 * the same wizard with no account and no write, so the setup flow can be
 * looked at — and screenshotted — without creating a real tournament.
 */
export function NewTournamentScreen({ demo = false }: { demo?: boolean } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { ready, user, isAnonymous } = useAuth()
  const key = draftKey(demo)
  const [draft] = useState(() => readDraft(key))
  const [name, setName] = useState(draft?.name ?? '')
  const [tagline, setTagline] = useState(draft?.tagline ?? '')
  const [askPreset, setAskPreset] = useState<PresetId | null>(null)
  // A new tournament starts blank, not on a template: four games already
  // ticked is exactly the "demasiados prellenados" the setup was rebuilt for.
  // Templates are still one tap away, behind "¿Prefieres empezar de una
  // plantilla?" on step 2.
  const [players, setPlayers] = useState(draft?.players ?? BLANK.players)
  const [settings, setSettings] = useState<TournamentSettings>(() => draft?.settings ?? BLANK.build())
  const [pristine, setPristine] = useState(draft?.pristine ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ slug: string; joinCode: string } | null>(null)

  useEffect(() => {
    if (!demo && ready && (!user || isAnonymous)) navigate('/organizer/login', { replace: true })
  }, [demo, ready, user, isAnonymous, navigate])

  // The step the address asks for, unless the draft can't be on it yet (an
  // address reloaded with nothing stored): then the first step it can be on.
  const asked = stepOf(params.get(STEP_PARAM))
  const step: Step = asked > 1 && name.trim().length < 3 ? 1 : asked > 2 && players < 2 ? 2 : asked
  useEffect(() => {
    if (!created && step !== asked) setParams(withStep(params, step), { replace: true })
  }, [created, step, asked, params, setParams])
  const forward = (next: Step) => setParams(withStep(params, next), { state: { [FROM_STEP]: true } })
  // «Atrás» is the system back when this entry was pushed from the step before, so history stays one entry per step.
  const back = (prev: Step) => ((location.state as Record<string, unknown> | null)?.[FROM_STEP] ? void navigate(-1) : setParams(withStep(params, prev), { replace: true }))

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
  // What parses but makes no sense (MONEY-13) holds «Crear» too, named where the button is.
  const sense = useMemo(() => (parsed.success ? settingsSense(parsed.data, field) : []), [parsed, field])
  const creatable = parsed.success && !!check?.ok && sense.length === 0
  const W = t.organizer.wizard
  const stepNames = [W.step1, W.step2, W.review]

  // Anything typed or chosen: kept for a reload, and asked about before leaving.
  const dirty = !created && (name.trim() !== '' || tagline.trim() !== '' || players !== BLANK.players || JSON.stringify(parsed.success ? parsed.data : settings) !== BLANK_SETTINGS)
  useEffect(() => {
    if (created) return
    if (dirty) writeDraft(key, { name, tagline, players, settings, pristine })
    else clearDraft(key)
  }, [created, dirty, key, name, tagline, players, settings, pristine])

  // Leaving the wizard (a link, or the system back or forward off it) with a draft asks first. Moving between
  // steps is the same path and never asks; nor does the sign-in redirect, which comes before anything is typed.
  const guard = dirty && (demo || (ready && !!user && !isAnonymous))
  const leaving = useRef(false)
  /** How the blocked navigation was going: a back or forward (to which entry), or a push. */
  const blocked = useRef<{ pop: boolean; index: number | undefined } | null>(null)
  // A blocked back or forward is undone by the router with a history move of its own. The question's
  // sheet pushes an entry, and one pushed before that move lands is closed by it, as a back would.
  const [restoring, setRestoring] = useState(false)
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation, historyAction }) => {
      if (leaving.current || !guard || currentLocation.pathname === nextLocation.pathname) return false
      // On a back the history has already moved: its state is the entry it was going to.
      const index = historyIndex()
      blocked.current = { pop: historyAction === 'POP', index }
      if (historyAction === 'POP' && index !== undefined) {
        // This runs inside that popstate, so the listener added now hears only the next one: the undo.
        setRestoring(true)
        const done = () => {
          clearTimeout(timer)
          window.removeEventListener('popstate', done)
          setRestoring(false)
        }
        const timer = setTimeout(done, 1000)
        window.addEventListener('popstate', done)
      }
      return true
    },
    [guard],
  )
  const blocker = useBlocker(shouldBlock)
  const leave = () => {
    if (blocker.state !== 'blocked') return
    const to = blocker.location
    const how = blocked.current
    leaving.current = true
    clearDraft(key)
    // The question's sheet holds a history entry of its own. Give it back first, then go the way the
    // person was going: the router's own proceed would step from the sheet's entry, onto the wizard.
    const gone = leaveSheetHistory()
    blocker.reset()
    void gone.then(() =>
      // A tick later, once every listener has seen that back.
      setTimeout(() => {
        const here = historyIndex()
        const delta = how?.pop ? (how.index !== undefined && here !== undefined ? how.index - here : -1) : 0
        if (delta < 0) void navigate(delta)
        // A push, or a forward the sheet's entry cut off (a push drops what lies ahead): a new entry.
        else void navigate({ pathname: to.pathname, search: to.search, hash: to.hash }, { state: to.state })
      }, 0),
    )
  }

  async function create() {
    if (!parsed.success || !creatable) return
    setBusy(true)
    setError(null)
    try {
      // The organizer's own zone, not the platform's placeholder.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || parsed.data.timezone
      const row = demo ? { id: '', slug: 'ejemplo', joinCode: 'EJEMPL' } : await createTournament({ name: name.trim(), tagline: tagline.trim() || undefined, settings: { ...parsed.data, timezone, expectedPlayers: players } })
      // The days asked for on step 2, as rounds (UX-06): «Rondas» used to say «Sin rondas» right after.
      // Course and date come later, in the Comité. If this fails the tournament still exists, and
      // «Para empezar» lists the rounds still to create.
      if (!demo) {
        try {
          for (let n = 1; n <= parsed.data.rounds; n++) await upsertRound(row.id, { number: n, date: null, course_id: null, holes: 18 })
        } catch (e) {
          console.warn('[wizard] rounds not created', e)
        }
      }
      clearDraft(key)
      setCreated({ slug: row.slug, joinCode: row.joinCode })
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  const nav = (prev: Step, next: Step | null, nextLabel: string = t.common.next, disabled = false, onNext?: () => void) => (
    <div className={styles.actions}>
      <button className="btn btn--secondary" type="button" onClick={() => back(prev)}>
        {t.common.back}
      </button>
      <button className="btn btn--primary" type="button" disabled={disabled} onClick={() => (onNext ? onNext() : next && forward(next))}>
        {nextLabel}
      </button>
    </div>
  )

  const link = created ? `${window.location.origin}/t/${created.slug}` : ''
  const shown = created ? DONE : step

  return (
    <div className={styles.screen}>
      <Link to="/organizer" className={styles.brand}>
        <Wordmark />
      </Link>
      <div className={styles.progress}>
        <h1>{shown === DONE ? W.created : W.title}</h1>
        {/* Created: the steps are behind it, so «Paso 3 de 3» would point back at them. */}
        {shown !== DONE && (
          <>
            <div className={styles.progressBar} aria-hidden="true">
              {stepNames.map((s, i) => (
                <span key={s} className={`${styles.progressSeg} ${i + 1 <= shown ? styles.progressDone : ''}`} />
              ))}
            </div>
            <span className={styles.progressText}>
              {W.stepOf(step, TOTAL_STEPS)}, <strong>{stepNames[step - 1]}</strong>
            </span>
          </>
        )}
      </div>

      {shown === 1 && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length >= 3) forward(2)
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

      {shown === 2 && (
        <div className={styles.form}>
          <PlayStep value={settings} onChange={edit} players={players} onPlayers={setPlayers} onPreset={(id) => (pristine ? applyPreset(id) : setAskPreset(id))} />
          {nav(1, 3, t.common.next, players < 2)}
        </div>
      )}

      {shown === 3 && (
        <div className={styles.form}>
          <ReviewCard name={name} tagline={tagline} settings={settings} players={players} check={check} />
          {error && <p className="error">{error}</p>}
          {!creatable && <p className="help">{W.fixToCreate}</p>}
          {sense.length > 0 && (
            <ul className="error">
              {sense.map((x) => (
                <li key={`${x.key}:${x.text}`}>{x.text}</li>
              ))}
            </ul>
          )}
          {nav(2, null, busy ? W.creating : W.create, busy || !creatable, () => void create())}
        </div>
      )}

      <ConfirmSheet open={!!askPreset} title={W.replaceTitle} body={W.replaceBody} confirmLabel={W.replaceConfirm} onConfirm={() => askPreset && applyPreset(askPreset)} onClose={() => setAskPreset(null)} />
      <ConfirmSheet open={blocker.state === 'blocked' && !restoring} title={W.leaveTitle} body={W.leaveBody} confirmLabel={W.leaveConfirm} cancelLabel={W.leaveStay} danger onConfirm={leave} onClose={() => blocker.state === 'blocked' && blocker.reset()} />

      {shown === DONE && created && (
        <div className={`${styles.created} fade-in`}>
          {/* What comes next first (UX-06). The code used to lead, and players who joined
              with it found an empty face grid: it waits until there are players. */}
          <p>{W.nextSteps}</p>
          <Link className="btn btn--primary btn--block" to={`/t/${created.slug}/admin`}>
            {W.goAdmin}
          </Link>
          <details className={styles.shareLater}>
            <summary>
              {W.shareLater}
              <IconChevronRight size={18} />
            </summary>
            <span className="label">{t.organizer.joinCode}</span>
            <span className={styles.bigCode}>{created.joinCode}</span>
            <span className={styles.link}>{link}</span>
            <p className="help">{W.shareHint}</p>
            <div className={styles.shareRow}>
              <CopyButton text={link} label={t.organizer.link} />
              <CopyButton text={created.joinCode} label={t.organizer.joinCode} />
              <ShareButton text={t.common.joinWithCode(name, created.joinCode)} url={link} title={name} />
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

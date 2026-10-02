import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { EventName } from '../../components/primitives'
import { nearestAccent } from '../../design/accents'
import { claimPlayer, type LookupResult } from '../../data/api'
import { useAuth } from '../../data/auth'
import { queuedFor } from '../../data/outbox'
import { linkMyProfile, unlinkMyProfile, useMyProfile } from '../../data/profiles'
import styles from './EnterScreen.module.css'
import { humanError } from '../../lib/humanError'
import { LegalConsent } from '../../components/LegalLinks'

/** Above this many players the grid goes dense and gets a name filter. */
const DENSE_FROM = 16

/**
 * Entrar: the event name, the players, a PIN. Nothing else stands between
 * a player and the tournament.
 */
export function EnterScreen({ lookup, onEntered }: { lookup: LookupResult; onEntered: () => void }) {
  const { user, isAnonymous } = useAuth()
  const [selected, setSelected] = useState<LookupResult['players'][number] | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  /** After a PIN on an account: offer to keep this tournament in the profile. */
  const [askSave, setAskSave] = useState<LookupResult['players'][number] | null>(null)
  const account = !!user && !isAnonymous
  const pinHintId = useId()
  const consentId = useId()
  // Holes this phone queued before its session lapsed: they go out once the player is back (REL-16).
  const { heldHoles } = queuedFor(lookup.id)

  const dense = lookup.players.length > DENSE_FROM
  const players = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return lookup.players
    return lookup.players.filter((p) => p.displayName.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q))
  }, [lookup.players, query])

  async function submit(nextPin: string) {
    if (!selected || nextPin.length !== 4) return
    setBusy(true)
    setError(null)
    try {
      const r = await claimPlayer(selected.id, nextPin)
      if (r.ok) {
        if (account && !selected.hasProfile) setAskSave(selected)
        else onEntered()
        return
      }
      setPin('')
      if (r.reason === 'no_pin') setError(t.enter.noPin)
      else if (r.reason === 'locked') setError(t.enter.locked)
      else if (r.reason === 'wrong_pin') setError(`${t.enter.wrongPin} ${r.attemptsLeft != null ? t.enter.attemptsLeft(r.attemptsLeft) : ''}`)
      else if (r.reason === 'already_linked') setError(t.enter.alreadyLinked(lookup.players.find((p) => p.id === r.playerId)?.displayName ?? ''))
      else setError(t.enter.notFound)
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  /** "¿Eres tú?": the Comité proposed this player for my profile; yes links it, no clears the proposal. */
  async function answer(yes: boolean) {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      if (yes) {
        const r = await linkMyProfile(selected.id)
        if (!r.ok) {
          setError(r.reason === 'already_linked' ? t.account.already : t.account.linkTaken)
          return
        }
      } else await unlinkMyProfile(selected.id)
      void useMyProfile.getState().load()
      onEntered()
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveToProfile() {
    if (!askSave) return
    setBusy(true)
    try {
      await linkMyProfile(askSave.id)
      void useMyProfile.getState().load()
    } catch {
      // Entering matters more than saving; Más offers it again.
    } finally {
      setBusy(false)
      onEntered()
    }
  }

  const accent = nearestAccent(lookup.accentColor).hex

  return (
    <div className={styles.screen} style={{ '--event-accent': accent } as React.CSSProperties}>
      <EventName name={lookup.name} tagline={lookup.tagline ?? undefined} logoUrl={lookup.logoUrl} />

      {!selected ? (
        <>
          <div className={styles.top}>
            <h2>{t.enter.tapYourFace}</h2>
            {/* Above the faces: with a full field the grid runs past the first screen (TRUST-05). */}
            <LegalConsent enter />
            {heldHoles > 0 && (
              <p className="help" role="status">
                {t.sync.heldForPin(heldHoles)}
              </p>
            )}
            {lookup.players.length === 0 && <p className="help">{t.enter.noPlayers}</p>}
            {dense && (
              <input className="input" type="search" placeholder={t.enter.search} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" aria-label={t.enter.search} />
            )}
          </div>
          {dense && players.length === 0 && query && <p className="help">{t.enter.noMatch}</p>}
          <div className={`${styles.grid} ${dense ? styles.gridDense : ''}`}>
            {players.map((p) => (
              <button key={p.id} type="button" className={styles.face} onClick={() => setSelected(p)}>
                <Avatar name={p.displayName} url={p.avatarUrl} size={dense ? undefined : 'lg'} honoree={p.isHonoree} />
                <span className={styles.faceName}>{p.displayName}</span>
                {p.pendingMe ? <span className={styles.faceAsk}>{t.enter.isThisYou}</span> : p.tier && <span className="tierBadge">{p.tier}</span>}
              </button>
            ))}
          </div>
          {user && !isAnonymous && (
            <Link className="btn btn--ghost btn--sm" to="/organizer">
              {t.enter.organizerEnter}
            </Link>
          )}
        </>
      ) : askSave ? (
        <div className={`${styles.pinStep} fade-in`}>
          <div className={styles.who}>
            <Avatar name={askSave.displayName} url={askSave.avatarUrl} size="lg" honoree={askSave.isHonoree} />
            <div className="grow">
              <h2>{t.more.saveHere}</h2>
              <p className="help">{t.more.saveProfileHint}</p>
            </div>
          </div>
          <div className={styles.actions}>
            <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => onEntered()}>
              {t.common.notNow}
            </button>
            <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void saveToProfile()}>
              {t.common.save}
            </button>
          </div>
        </div>
      ) : selected.pendingMe ? (
        <div className={`${styles.pinStep} fade-in`}>
          <div className={styles.who}>
            <Avatar name={selected.displayName} url={selected.avatarUrl} size="lg" honoree={selected.isHonoree} />
            <div className="grow">
              <h2>{t.enter.isThisYou}</h2>
              <p className="help">{t.enter.confirmYou(selected.displayName)}</p>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <div className={styles.actions}>
            <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void answer(false)}>
              {t.mipolo.no}
            </button>
            <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void answer(true)}>
              {t.mipolo.yes}
            </button>
          </div>
        </div>
      ) : (
        <div className={`${styles.pinStep} fade-in`}>
          <div className={styles.who}>
            <Avatar name={selected.displayName} url={selected.avatarUrl} size="lg" honoree={selected.isHonoree} />
            <div className="grow">
              <h2>{t.enter.enterAs(selected.displayName)}</h2>
              <p className="help" id={pinHintId}>
                {t.enter.pinHint}
              </p>
            </div>
          </div>
          {/* Before the field: the fourth digit claims the player (claim_player), so there is no later moment to read it. */}
          <LegalConsent enter id={consentId} />
          <label className="field">
            <span className="label">{t.enter.pin}</span>
            <input
              className={`input ${styles.pin}`}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              autoFocus
              aria-describedby={`${pinHintId} ${consentId}`}
              /*
               * Never `disabled` while it submits: disabling the field iOS has
               * the keyboard open for dismisses that keyboard, so a wrong PIN
               * left you staring at a field you had to tap again to retype.
               * `maxLength` already stops a fifth digit; the guard stops a
               * second submit from a backspace-and-retype mid-flight.
               */
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                setPin(v)
                if (v.length === 4 && !busy) void submit(v)
              }}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className={styles.actions}>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => {
                setSelected(null)
                setPin('')
                setError(null)
              }}
            >
              {t.enter.notMe}
            </button>
            <button className="btn btn--primary" type="button" disabled={busy || pin.length !== 4} onClick={() => void submit(pin)}>
              {busy ? t.auth.signingIn : t.home.joinButton}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

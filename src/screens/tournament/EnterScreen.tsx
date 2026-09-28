import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { EventName } from '../../components/primitives'
import { nearestAccent } from '../../design/accents'
import { claimPlayer, type LookupResult } from '../../data/api'
import { useAuth } from '../../data/auth'
import styles from './EnterScreen.module.css'

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
        onEntered()
        return
      }
      setPin('')
      if (r.reason === 'no_pin') setError(t.enter.noPin)
      else if (r.reason === 'locked') setError(t.enter.locked)
      else if (r.reason === 'wrong_pin') setError(`${t.enter.wrongPin} ${r.attemptsLeft != null ? t.enter.attemptsLeft(r.attemptsLeft) : ''}`)
      else setError(t.enter.notFound)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
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
                {p.tier && <span className="tierBadge">{p.tier}</span>}
              </button>
            ))}
          </div>
          {user && !isAnonymous && (
            <Link className="btn btn--ghost btn--sm" to="/organizer">
              {t.enter.organizerEnter}
            </Link>
          )}
        </>
      ) : (
        <div className={`${styles.pinStep} fade-in`}>
          <div className={styles.who}>
            <Avatar name={selected.displayName} url={selected.avatarUrl} size="lg" honoree={selected.isHonoree} />
            <div className="grow">
              <h2>{t.enter.enterAs(selected.displayName)}</h2>
              <p className="help">{t.enter.pinHint}</p>
            </div>
          </div>
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
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                setPin(v)
                if (v.length === 4) void submit(v)
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

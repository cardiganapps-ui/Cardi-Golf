import { useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { Wave } from '../../components/Wave'
import { claimPlayer, type LookupResult } from '../../data/api'
import { useAuth } from '../../data/auth'
import styles from './EnterScreen.module.css'

export function EnterScreen({ lookup, onEntered }: { lookup: LookupResult; onEntered: () => void }) {
  const { user, isAnonymous } = useAuth()
  const [selected, setSelected] = useState<LookupResult['players'][number] | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const accent = lookup.accentColor ?? undefined

  return (
    <div className="screen" style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}>
      <header className={styles.header}>
        {lookup.logoUrl ? <img className={styles.logo} src={lookup.logoUrl} alt="" /> : null}
        <h1>{lookup.name}</h1>
        {lookup.tagline && <p className="muted">{lookup.tagline}</p>}
        <Wave />
      </header>

      {!selected ? (
        <>
          <h2>{t.enter.tapYourFace}</h2>
          {lookup.players.length === 0 && <p className="muted">{t.enter.noPlayers}</p>}
          <div className={styles.grid}>
            {lookup.players.map((p) => (
              <button key={p.id} type="button" className={styles.face} onClick={() => setSelected(p)}>
                <Avatar name={p.displayName} url={p.avatarUrl} size="lg" honoree={p.isHonoree} />
                <span className={styles.faceName}>{p.displayName}</span>
                {p.tier && <span className="tierBadge">{p.tier}</span>}
              </button>
            ))}
          </div>
          {user && !isAnonymous && (
            <Link className="btn btn--ghost" to="/organizer">
              {t.enter.organizerEnter}
            </Link>
          )}
        </>
      ) : (
        <div className="stack stack--lg fade-in">
          <div className="row">
            <Avatar name={selected.displayName} url={selected.avatarUrl} size="lg" honoree={selected.isHonoree} />
            <div className="grow">
              <h2>{t.enter.enterAs(selected.displayName)}</h2>
              <p className="help">{t.enter.pinHint}</p>
            </div>
          </div>
          <label className="field">
            <span className="label">{t.enter.pin}</span>
            <input
              className={`input num ${styles.pin}`}
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
          <div className="row">
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
            <button className="btn btn--primary grow" type="button" disabled={busy || pin.length !== 4} onClick={() => void submit(pin)}>
              {t.home.joinButton}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * En vivo, once per tournament and player on this phone, after the PIN
 * (TRUST-16): «Esto es lo que el Comité guardó de ti». Most people Polo
 * keeps data on never signed up: the Comité typed their name, photo,
 * handicap (or the three rounds behind it) and form guide. This says what it
 * is and who sees it, and «Pedir corrección» sends what is wrong to the
 * Comité (request_player_correction, 0070), which sees it in Comité ›
 * Jugadores. Only on a phone that entered with the player's PIN: never on a
 * link to watch, the Comité with no player, or the design fixtures.
 */
import { memo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Field, toast } from '../../components/ui'
import { requestCorrection } from '../../data/myData'
import { useTournament } from '../../data/tournamentStore'
import { formatIndex } from '../../data/profiles'
import { humanError } from '../../lib/humanError'
import { useTournamentCtx } from './TournamentGate'
import styles from '../../components/InstallGuide.module.css'

const M = t.myData
const key = (tid: string, pid: string) => `cardi-golf:my-data-seen:${tid}:${pid}`

function seen(tid: string, pid: string): boolean {
  try {
    return localStorage.getItem(key(tid, pid)) != null
  } catch {
    return false
  }
}
function markSeen(tid: string, pid: string) {
  try {
    localStorage.setItem(key(tid, pid), String(Date.now()))
  } catch {
    // Private mode: hidden for this visit only.
  }
}

/** Memoized, as QuickFinish: a score that changes En vivo is none of this card's (PERF-09). */
export const MyDataCard = memo(function MyDataCard() {
  const { tournamentId, me, spectator } = useTournamentCtx()
  const player = useTournament((s) => s.data?.snapshot.players.find((p) => p.id === me.playerId) ?? null)
  const pid = me.playerId
  const [hidden, setHidden] = useState(() => !pid || seen(tournamentId, pid))
  const [asking, setAsking] = useState(false)
  const [what, setWhat] = useState('')
  const [busy, setBusy] = useState(false)
  if (spectator || me.via !== 'device' || !pid || !player || hidden) return null

  const close = () => {
    markSeen(tournamentId, pid)
    setHidden(true)
  }
  async function send() {
    setBusy(true)
    try {
      await requestCorrection(tournamentId, what)
      toast(M.sent)
      close()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  const handicap =
    player.handicapSource === 'index' && player.handicapIndex != null
      ? M.handicapIndex(formatIndex(player.handicapIndex))
      : player.handicapSource === 'estimate' && player.estimateInputs
        ? M.handicapEstimate(player.estimateInputs.map((r) => String(r.gross)).join(', '))
        : M.handicapManual(formatIndex(player.baseHcp))
  const lines: Array<[string, string]> = [
    [M.name, player.fullName && player.fullName !== player.displayName ? `${player.fullName}, ${M.shortName(player.displayName)}` : player.displayName],
    [M.photo, player.avatarUrl ? M.photoYes : M.photoNo],
    ...(player.tier ? ([[M.tier, player.tier]] as Array<[string, string]>) : []),
    [M.handicap, handicap],
    [M.form, player.formGuide?.trim() || M.none],
  ]

  return (
    <section className={styles.guide} aria-labelledby="my-data-card">
      <h2 id="my-data-card">{M.title}</h2>
      <p className="help">{M.lede}</p>
      <dl className="stack">
        {lines.map(([label, value]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {asking ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (what.trim().length >= 3 && !busy) void send()
          }}
        >
          <Field label={M.what} hint={M.whatHint}>
            <textarea className="textarea" rows={3} maxLength={500} value={what} onChange={(e) => setWhat(e.target.value)} />
          </Field>
          <div className={styles.actions}>
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy || what.trim().length < 3}>
              {M.send}
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAsking(false)}>
              {t.common.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <button className="btn btn--secondary btn--sm" type="button" onClick={close}>
            {M.ok}
          </button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAsking(true)}>
            {M.ask}
          </button>
        </div>
      )}
    </section>
  )
})

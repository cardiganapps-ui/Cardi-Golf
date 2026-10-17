/**
 * «Avisos del torneo» (PWA-10): this tournament's notices on this phone (a
 * day that starts, a card to sign, the snake's question, the results), never
 * an amount.
 * - `TournamentPushSwitch` in Más, always, for whoever plays in it.
 * - `TournamentPushOffer` on En vivo, in the installed app, once this phone's
 *   player has a hole saved: when the notices are worth something, never on
 *   load and never over the Tarjeta. «Ahora no» puts it away for this
 *   tournament; the switch in Más stays.
 * A phone that holds its player by PIN saves its address for him (0052, gone
 * when it stops holding him); an account that is the player's turns on its
 * own notices, which carry its tournaments' too. The permission prompt comes
 * only from the tap on «Activar avisos».
 * Both sit on screens that render on every change of the boards: each reads
 * only what it shows, so a hole saved anywhere renders neither (PERF-09).
 */
import { memo, useId, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { NoticeNote } from '../../components/LegalLinks'
import { isStandalone } from '../../lib/install'
import { useTournament } from '../../data/tournamentStore'
import { pushNote, usePushSwitch } from '../profile/usePushSwitch'
import { tournamentPushHint } from './pushHint'
import { useTournamentCtx } from './tournamentContext'
import styles from './TournamentPush.module.css'
import { Button } from '../../components/primitives'

const P = t.push
const T = t.push.tournament

/**
 * Whose notices they are on this phone: its PIN's player (the tournament's id), or the account that is the
 * player (null). Nobody's (undefined) for the Comité without a player and for the Admin de Polo.
 */
function useWhose(): string | null | undefined {
  const { me, tournamentId } = useTournamentCtx()
  if (!me.playerId || me.via === 'platform') return undefined
  return me.via === 'profile' ? null : tournamentId
}

/** «Ahora no» on En vivo, for this tournament. */
const LATER = (tournamentId: string) => `cardi-golf:push-offer:${tournamentId}`
function putOff(tournamentId: string): boolean {
  try {
    return localStorage.getItem(LATER(tournamentId)) === 'later'
  } catch {
    return false
  }
}

export const TournamentPushSwitch = memo(function TournamentPushSwitch() {
  const whose = useWhose()
  if (whose === undefined) return null
  return <PushSwitch tournamentId={whose} />
})

function PushSwitch({ tournamentId }: { tournamentId: string | null }) {
  const hint = useTournament((s) => tournamentPushHint(s.data?.settings))
  const { state, busy, enable, disable } = usePushSwitch(tournamentId)
  const noteId = useId()
  const titleId = useId()
  if (state === null) return null
  return (
    <section className={styles.switch} aria-labelledby={titleId}>
      <span className="label" id={titleId}>
        {T.title}
      </span>
      <p className="help">{pushNote(state, hint)}</p>
      {/* Before the tap that stores this browser's address (TRUST-05), and heard with the button. */}
      {state === 'off' && <NoticeNote note={tournamentId ? t.legal.pinPushNote : t.legal.pushNote} id={noteId} />}
      {state === 'off' && (
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void enable()} aria-describedby={noteId}>
          {P.enable}
        </Button>
      )}
      {state === 'on' && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disable()}>
          {P.disable}
        </Button>
      )}
    </section>
  )
}

export const TournamentPushOffer = memo(function TournamentPushOffer() {
  const { me, tournamentId } = useTournamentCtx()
  const whose = useWhose()
  // A hole this phone's player saved (here or on his other phone): the boards say so, offline too.
  const saved = useTournament(
    (s) => !!me.playerId && !!s.data?.snapshot.scores.some((x) => x.enteredBy === me.playerId),
  )
  const [later, setLater] = useState(() => putOff(tournamentId))
  if (whose === undefined || !saved || later || !isStandalone()) return null
  return (
    <PushOffer
      tournamentId={whose}
      onLater={() => {
        try {
          localStorage.setItem(LATER(tournamentId), 'later')
        } catch {
          /* private mode: it stays away for this visit */
        }
        setLater(true)
      }}
    />
  )
})

function PushOffer({ tournamentId, onLater }: { tournamentId: string | null; onLater: () => void }) {
  const hint = useTournament((s) => tournamentPushHint(s.data?.settings))
  const { state, busy, enable } = usePushSwitch(tournamentId)
  const noteId = useId()
  // Only what one tap turns on: on, blocked, or impossible here is the switch's to explain, in Más.
  if (state !== 'off') return null
  return (
    <section className={styles.offer} aria-label={T.title}>
      <h2>{T.title}</h2>
      <p className="help">{hint}</p>
      <NoticeNote note={tournamentId ? t.legal.pinPushNote : t.legal.pushNote} id={noteId} />
      <div className={styles.actions}>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void enable()} aria-describedby={noteId}>
          {P.enable}
        </Button>
        <Button variant="ghost" size="sm" onClick={onLater}>
          {T.later}
        </Button>
      </div>
    </section>
  )
}

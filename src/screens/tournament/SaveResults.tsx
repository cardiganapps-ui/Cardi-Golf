/**
 * «Guarda tus rondas» (STRAT-08): the end of the trip is when a player on a
 * PIN keeps what he played. Results reach a profile only through a confirmed
 * link, and the only offer sat in Más, so the launch's players would leave
 * Los Cabos with nothing: no history, no index. On the Ceremonia's last step
 * and on En vivo once the tournament is Terminado, for this phone's player
 * while he is here by his PIN and nowhere else:
 * - an anonymous phone goes to /entrar, which turns this phone into the
 *   account in place and saves its player in it (§7 «Player accounts»), and
 *   comes back here;
 * - a phone already signed in to an account saves this tournament in it at once.
 * A player already linked, the Comité with no player and a link to watch see nothing.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/toast'
import { useAuth } from '../../data/auth'
import { linkMyProfile, useMyProfile } from '../../data/profiles'
import { useTournament } from '../../data/tournamentStore'
import { humanError } from '../../lib/humanError'
import { useTournamentCtx } from './tournamentContext'
import styles from './SaveResults.module.css'
import { buttonClass } from '../../components/buttonClass'

const S = t.saveResults

/** How this phone's player can keep the tournament: convert the anonymous phone, link the account it has, or nothing to do. */
function useSaveMode(): 'convert' | 'link' | null {
  const { me, spectator } = useTournamentCtx()
  const { user, isAnonymous } = useAuth()
  if (spectator || !me.playerId) return null
  const account = !!user && !isAnonymous
  // As Más decides it: an anonymous phone is here by its PIN; an account is, unless its profile is the link.
  if (!account) return 'convert'
  return me.via === 'device' ? 'link' : null
}

export function SaveResults({ board = false }: { board?: boolean }) {
  const { me, slug, refresh } = useTournamentCtx()
  const mode = useSaveMode()
  const name = useTournament((s) => s.data?.snapshot.tournament.name ?? '')
  const [busy, setBusy] = useState(false)
  if (!mode || !me.playerId) return null
  const back = `/t/${slug}`

  async function link() {
    if (!me.playerId) return
    setBusy(true)
    try {
      const r = await linkMyProfile(me.playerId)
      toast(r.ok ? t.more.savedHere : r.reason === 'already_linked' ? t.account.already : t.account.linkTaken)
      await Promise.all([refresh(), useMyProfile.getState().load()])
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Not a landmark: on the Ceremonia it sits inside the stage's own region, which stays the one a screen reader walks.
    <div className={`${styles.save} ${board ? styles.board : ''}`} data-save-results>
      <h2 className={styles.title}>
        {S.title}
      </h2>
      <p className={styles.body}>{S.body(name)}</p>
      <ul className={styles.gets}>
        {S.gets.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      {mode === 'convert' ? (
        <Link className={buttonClass({ variant: 'primary', block: !board }, board ? styles.bigBtn : undefined)} to={`/entrar?next=${encodeURIComponent(back)}`}>
          {S.action}
        </Link>
      ) : (
        <button className={buttonClass({ variant: 'primary', block: !board }, board ? styles.bigBtn : undefined)} type="button" disabled={busy} onClick={() => void link()}>
          {busy ? t.common.saving : S.actionHere}
        </button>
      )}
      {mode === 'convert' && <p className={styles.hint}>{S.hint}</p>}
    </div>
  )
}

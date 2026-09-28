/**
 * Más: who I am, the way into the Comité, the other screens as a ruled list,
 * the join code to share, the install guide, and the session controls.
 */
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { InstallGuide } from '../../components/InstallGuide'
import { Avatar, CopyButton, ShareButton } from '../../components/ui'
import { useAuth, signOut } from '../../data/auth'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import { IconBook, IconChart, IconTrophy, IconTv } from '../../components/icons'
import styles from './MoreScreen.module.css'

export function MoreScreen() {
  const { me, slug, lookup, leave } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const { user, isAnonymous } = useAuth()
  const navigate = useNavigate()
  const player = data?.snapshot.players.find((p) => p.id === me.playerId)
  const link = `${window.location.origin}/t/${slug}`
  const joinCode = data?.snapshot.tournament.joinCode ?? lookup.joinCode

  return (
    <div className={styles.screen}>
      <h1>{t.more.title}</h1>
      <div className={styles.me}>
        {player ? <Avatar name={player.displayName} url={player.avatarUrl} honoree={player.isHonoree} /> : <Avatar name={user?.email ?? 'O'} />}
        <div className={styles.meText}>
          <span className="label">{t.more.whoAmI}</span>
          <span className={styles.meName}>{player?.fullName ?? (me.isOrganizer ? `${t.more.organizer}, ${user?.email ?? ''}` : '')}</span>
        </div>
      </div>

      {me.isAdmin && (
        <Link className="btn btn--primary btn--block" to={`/t/${slug}/admin`}>
          {t.more.admin}
        </Link>
      )}
      <nav className={styles.links}>
        <Link className={styles.link} to={`/t/${slug}/stats`}>
          <IconChart /> {t.more.stats}
        </Link>
        <Link className={styles.link} to={`/t/${slug}/reglamento`}>
          <IconBook /> {t.more.rules}
        </Link>
        <Link className={styles.link} to={`/t/${slug}/tv`}>
          <IconTv /> {t.more.tv}
        </Link>
        {me.isAdmin && (
          <Link className={styles.link} to={`/t/${slug}/ceremonia`}>
            <IconTrophy /> {t.more.ceremony}
          </Link>
        )}
      </nav>

      <div className={styles.join}>
        <span className="label">{t.organizer.joinCode}</span>
        <span className={styles.code}>{joinCode}</span>
        <div className={styles.row}>
          <CopyButton text={link} label={t.organizer.link} />
          <ShareButton text={t.common.joinWithCode(lookup.name, joinCode)} url={link} title={lookup.name} />
        </div>
      </div>

      <InstallGuide />

      <div className={styles.session}>
        {me.playerId && (
          <button className="btn btn--secondary" type="button" onClick={() => void leave()}>
            {t.enter.switchPlayer}
          </button>
        )}
        {user && !isAnonymous && (
          <>
            <Link className="btn btn--ghost" to="/organizer/reset">
              {t.auth.changePassword}
            </Link>
            <button className="btn btn--ghost" type="button" onClick={() => signOut().then(() => navigate('/'))}>
              {t.common.logout}
            </button>
          </>
        )}
        <Link className="btn btn--ghost" to="/">
          {t.errors.backHome}
        </Link>
      </div>
      <p className={styles.version}>
        {t.more.version} {__APP_VERSION__}
      </p>
    </div>
  )
}

import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { InstallGuide } from '../../components/InstallGuide'
import { Avatar, CopyButton, ShareButton } from '../../components/ui'
import { useAuth, signOut } from '../../data/auth'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'

export function MoreScreen() {
  const { me, slug, lookup, leave } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const { user, isAnonymous } = useAuth()
  const navigate = useNavigate()
  const player = data?.snapshot.players.find((p) => p.id === me.playerId)
  const link = `${window.location.origin}/t/${slug}`
  const joinCode = data?.snapshot.tournament.joinCode ?? lookup.joinCode

  return (
    <div className="screen">
      <h1>{t.more.title}</h1>
      <div className="card card--cell row">
        {player ? <Avatar name={player.displayName} url={player.avatarUrl} honoree={player.isHonoree} /> : <Avatar name={user?.email ?? 'O'} />}
        <div className="grow">
          <span className="label">{t.more.whoAmI}</span>
          <strong style={{ display: 'block' }}>{player?.fullName ?? (me.isOrganizer ? `${t.more.organizer} · ${user?.email ?? ''}` : '')}</strong>
        </div>
      </div>

      {me.isAdmin && (
        <Link className="btn btn--primary btn--block" to={`/t/${slug}/admin`}>
          {t.more.admin}
        </Link>
      )}

      <div className="card">
        <span className="label">{t.organizer.joinCode}</span>
        <p className="num" style={{ fontSize: '1.8rem', letterSpacing: '0.2em' }}>
          {joinCode}
        </p>
        <div className="row row--wrap" style={{ marginTop: 8 }}>
          <CopyButton text={link} label={t.organizer.link} />
          <ShareButton text={`${lookup.name}: entra con el código ${joinCode}`} url={link} title={lookup.name} />
        </div>
      </div>

      <InstallGuide />

      <div className="stack">
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
      <p className="help">
        {t.more.version} {__APP_VERSION__}
      </p>
    </div>
  )
}

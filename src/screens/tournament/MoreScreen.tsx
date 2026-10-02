/**
 * Más: who I am, the way into the Comité, the other screens as a ruled list,
 * the join code to share, the install guide, and the session controls.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { buildLabel } from '../../lib/build'
import { InstallGuide } from '../../components/InstallGuide'
import { Avatar, CopyButton, ShareButton, Sheet, toast } from '../../components/ui'
import { useAuth } from '../../data/auth'
import { signOutSafely } from '../../data/account'
import { linkMyProfile, unlinkMyProfile, useMyProfile } from '../../data/profiles'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { queuedFor, useOutbox } from '../../data/outbox'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './TournamentGate'
import { IconBook, IconChart, IconPerson, IconTrophy, IconTv } from '../../components/icons'
import styles from './MoreScreen.module.css'
import { humanError } from '../../lib/humanError'

export function MoreScreen() {
  const { me, slug, lookup, leave, refresh } = useTournamentCtx()
  const data = useTournament((s) => s.data)
  const { user, isAnonymous } = useAuth()
  const profile = useMyProfile((s) => s.profile)
  // The browser would not promise to keep unsent holes under storage pressure (REL-18).
  const persistent = useOutbox((s) => s.persistent)
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [askNotMe, setAskNotMe] = useState(false)
  /** Holes still on this phone when the player tried to switch: switching would strand them (UX-09, REL-16). */
  const [unsent, setUnsent] = useState(0)
  const account = !!user && !isAnonymous

  async function saveHere() {
    if (!me.playerId) return
    setSaving(true)
    try {
      const r = await linkMyProfile(me.playerId)
      toast(r.ok ? t.more.savedHere : r.reason === 'already_linked' ? t.account.already : t.account.linkTaken)
      await Promise.all([refresh(), useMyProfile.getState().load()])
    } catch (e) {
      toast(humanError(e))
    } finally {
      setSaving(false)
    }
  }

  /** A profile-linked account leaves by dropping the link ("No soy yo"); the device claim goes with it. */
  async function notMe() {
    if (!me.playerId) return
    setSaving(true)
    try {
      await unlinkMyProfile(me.playerId)
      await useMyProfile.getState().load()
      await leave()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setSaving(false)
      setAskNotMe(false)
    }
  }

  async function logout() {
    const r = await signOutSafely()
    if (r.done) navigate('/')
    else toast(r.reason)
  }
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
          <span className={styles.meName}>{player?.fullName ?? (me.via === 'platform' ? t.platform.title : me.isOrganizer ? `${t.more.organizer}, ${user?.email ?? ''}` : '')}</span>
        </div>
      </div>

      {me.isAdmin && (
        <Link className="btn btn--primary btn--block" to={`/t/${slug}/admin`}>
          {t.more.admin}
        </Link>
      )}
      {me.playerId && !account && (
        <div className={styles.join}>
          <span className="label">{t.account.title}</span>
          <p className="help">{t.more.saveProfileHint}</p>
          <Link className="btn btn--secondary btn--block" to={`/entrar?next=${encodeURIComponent(`/t/${slug}/mas`)}`}>
            {t.more.saveProfile}
          </Link>
        </div>
      )}
      {me.playerId && account && me.via === 'device' && (
        <button className="btn btn--secondary btn--block" type="button" disabled={saving} onClick={() => void saveHere()}>
          {t.more.saveHere}
        </button>
      )}

      <nav className={styles.links}>
        {account && profile && (
          <Link className={styles.link} to={`/p/${profile.handle}`}>
            <IconPerson /> {t.profile.myProfile}
          </Link>
        )}
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
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => {
              const n = queuedFor(lookup.id).holes
              if (n > 0) setUnsent(n)
              else if (me.via === 'profile') setAskNotMe(true)
              else void leave()
            }}
          >
            {me.via === 'profile' ? t.enter.notMe : t.enter.switchPlayer}
          </button>
        )}
        {user && !isAnonymous && (
          <>
            <Link className="btn btn--ghost" to="/organizer/reset">
              {t.auth.changePassword}
            </Link>
            <button className="btn btn--ghost" type="button" onClick={() => void logout()}>
              {t.common.logout}
            </button>
          </>
        )}
        <Link className="btn btn--ghost" to="/">
          {t.errors.backHome}
        </Link>
      </div>
      <Sheet open={unsent > 0} onClose={() => setUnsent(0)} title={t.sync.unsentBeforeSwitch(unsent)}>
        <p>{t.sync.unsentBeforeSwitchBody}</p>
        <button className="btn btn--primary" type="button" onClick={() => setUnsent(0)}>
          {t.sync.understood}
        </button>
      </Sheet>
      <ConfirmSheet
        open={askNotMe}
        title={t.enter.notMe}
        body={t.more.notMeBody(player?.displayName ?? '')}
        busy={saving}
        confirmLabel={t.enter.notMe}
        onConfirm={() => void notMe()}
        onClose={() => setAskNotMe(false)}
      />
      {persistent === false && <p className="help">{t.sync.notPersistent}</p>}
      <p className={styles.version}>
        {t.more.version} {buildLabel()}
      </p>
    </div>
  )
}

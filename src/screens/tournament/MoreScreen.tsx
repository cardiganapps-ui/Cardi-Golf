/**
 * Más: who I am, the way into the Comité, the other screens as a ruled list,
 * the join code to share, the install guide, and the session controls.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/es-MX'
import { buildLabel } from '../../lib/build'
import { InstallRow } from '../../components/InstallGuide'
import { Avatar, CopyButton, ShareButton, Sheet, Toggle, toast } from '../../components/ui'
import { canVibrate, haptic, hapticsOn, setHapticsOn } from '../../lib/haptics'
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
  const [askSwitch, setAskSwitch] = useState(false)
  /**
   * What is still on this phone when the player tried to switch: switching
   * would strand it (UX-09, REL-16). Any write, not only score holes: a card
   * signature still queued went out after the release under an identity no
   * longer in the group, and was refused for good.
   */
  const [unsent, setUnsent] = useState<{ holes: number; writes: number } | null>(null)
  /** The Tarjeta's vibration (MOT-10): on this phone only, offered where the phone can vibrate. */
  const [vibrate, setVibrate] = useState(hapticsOn)
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

  /** Waiting for the server to end the session: on lie-fi that takes until auth-js's own deadline. */
  const [signingOut, setSigningOut] = useState(false)
  async function logout() {
    setSigningOut(true)
    try {
      const r = await signOutSafely()
      if (r.done) navigate('/')
      else toast(r.reason)
    } finally {
      setSigningOut(false)
    }
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
        {/* Always here: the card on En vivo can be put off, and the steps never came back (PWA-08). */}
        <InstallRow className={styles.link} />
      </nav>

      <div className={styles.join}>
        <span className="label">{t.organizer.joinCode}</span>
        <span className={styles.code}>{joinCode}</span>
        <div className={styles.row}>
          <CopyButton text={link} label={t.organizer.link} />
          <ShareButton text={t.common.joinWithCode(lookup.name, joinCode)} url={link} title={lookup.name} />
        </div>
      </div>


      {canVibrate() && (
        <Toggle
          label={t.more.haptics}
          hint={t.more.hapticsHint}
          checked={vibrate}
          onChange={(on) => {
            setHapticsOn(on)
            setVibrate(on)
            if (on) haptic('tick')
          }}
        />
      )}

      <div className={styles.session}>
        {me.playerId && (
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => {
              const q = queuedFor(lookup.id)
              if (q.writes > 0) setUnsent(q)
              else if (me.via === 'profile') setAskNotMe(true)
              else setAskSwitch(true)
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
            <button className="btn btn--ghost" type="button" disabled={signingOut} onClick={() => void logout()}>
              {signingOut ? t.account.signingOut : t.common.logout}
            </button>
          </>
        )}
        <Link className="btn btn--ghost" to="/">
          {t.errors.backHome}
        </Link>
      </div>
      <Sheet open={!!unsent} onClose={() => setUnsent(null)} title={unsent?.holes ? t.sync.unsentBeforeSwitch(unsent.holes) : t.sync.unsentWritesBeforeSwitch}>
        <p>{t.sync.unsentBeforeSwitchBody}</p>
        <button className="btn btn--primary" type="button" onClick={() => setUnsent(null)}>
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
      <ConfirmSheet
        open={askSwitch}
        title={t.enter.switchPlayer}
        body={t.more.switchBody(player?.displayName ?? '')}
        busy={saving}
        confirmLabel={t.enter.switchPlayer}
        onConfirm={() => {
          // The holes may have gone on hold while the sheet was open: the guard runs again at the tap that leaves.
          const q = queuedFor(lookup.id)
          setAskSwitch(false)
          if (q.writes > 0) setUnsent(q)
          else void leave()
        }}
        onClose={() => setAskSwitch(false)}
      />
      {persistent === false && <p className="help">{t.sync.notPersistent}</p>}
      <p className={styles.version}>
        {t.more.version} {buildLabel()}
      </p>
    </div>
  )
}

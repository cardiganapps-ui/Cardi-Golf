/**
 * `/p/:handle`: a player's profile. The photo and the name, then the index
 * as the hero figure, then who they are, then their tournaments. Strangers
 * with an account see the card; people who shared a tournament see the rest.
 * (v0: history, badges and head-to-head arrive with results and friends.)
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Avatar, CopyButton, ShareButton, Spinner } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { IconChevronRight, IconSettings } from '../../components/icons'
import { ensureSession, useAuth } from '../../data/auth'
import { formatIndex, profileCard, useMyProfile, type MyLink, type ProfileCard } from '../../data/profiles'
import { PROFILE_FIXTURES } from '../../dev/profileFixtures'
import styles from './Profile.module.css'

const monthYear = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })

/** A tournament's logo, or its initial in a ruled square when it has none. */
export function EventMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return logoUrl ? (
    <img className={styles.logo} src={logoUrl} alt="" />
  ) : (
    <span className={styles.mono} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function ProfileView({ card, tournaments }: { card: ProfileCard; tournaments?: MyLink[] }) {
  const where = [card.homeClub, card.city].filter(Boolean).join(', ')
  const url = `${window.location.origin}/p/${card.handle}`
  const hasIndex = card.index != null
  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.brand} aria-label={t.app.name}>
          <Wordmark />
        </Link>
        {card.isMe && (
          <Link to="/perfil/editar" className={styles.iconBtn} aria-label={t.profile.edit}>
            <IconSettings />
          </Link>
        )}
      </div>

      <div className={styles.hero}>
        <Avatar name={card.displayName} url={card.avatarUrl} size="lg" />
        <div className={styles.heroText}>
          <h1 className={styles.name}>{card.displayName}</h1>
          <span className={styles.handle}>@{card.handle}</span>
          {where && <span className={styles.where}>{where}</span>}
        </div>
      </div>

      <div className={styles.stat}>
        <div className={styles.statText}>
          <span className="label">{card.indexSource === 'manual' ? t.profile.indexManual : t.profile.index}</span>
          <span className={styles.help}>{card.indexSource === 'manual' ? t.profile.manualNote : hasIndex ? t.profile.rounds(card.indexRounds) : t.profile.noIndex}</span>
        </div>
        {hasIndex && <span className={styles.statFigure}>{formatIndex(card.index)}</span>}
      </div>
      {!hasIndex && card.indexSource === 'polo' && card.isMe && <p className={styles.help}>{t.profile.noIndexHint}</p>}

      {card.bio && <p className={styles.bio}>{card.bio}</p>}

      {tournaments && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className="label">{t.profile.tournaments}</span>
          </div>
          {tournaments.length === 0 ? (
            <p className={styles.help}>{t.profile.noTournaments}</p>
          ) : (
            <div className={styles.rows}>
              {tournaments.map((l) => (
                <Link key={l.playerId} to={`/t/${l.slug}`} className={styles.row}>
                  <EventMark name={l.name} logoUrl={l.logoUrl} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{l.name}</span>
                    <span className={styles.rowSub}>{l.linkStatus === 'pending' ? t.profile.pending : t.status[l.tournamentStatus]}</span>
                  </span>
                  <span className={styles.rowEnd}>
                    <IconChevronRight size={20} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div className={styles.actions}>
        {card.isMe && (
          <Link className="btn btn--secondary" to="/perfil/editar">
            {t.profile.edit}
          </Link>
        )}
        <CopyButton text={url} label={t.profile.copyLink} />
        <ShareButton text={t.profile.shareText(card.displayName)} url={url} title={card.displayName} />
      </div>
      <p className={styles.foot}>{t.profile.memberSince(monthYear.format(new Date(card.memberSince)))}</p>
    </div>
  )
}

export function ProfileScreen() {
  const { handle = '' } = useParams()
  const { ready, user, isAnonymous } = useAuth()
  const links = useMyProfile((s) => s.links)
  const [card, setCard] = useState<ProfileCard | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    let live = true
    setCard(undefined)
    void (async () => {
      try {
        await ensureSession()
        const c = await profileCard(handle)
        if (live) setCard(c)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [ready, handle, user?.id])

  if (error) return <EmptyState title={t.common.error} body={error} />
  if (card === undefined) return <Spinner />
  if (card === null) {
    const anonymous = !user || isAnonymous
    return (
      <div className={styles.screen}>
        <Link to="/" className={styles.brand}>
          <Wordmark />
        </Link>
        <EmptyState
          title={t.profile.notFound}
          body={anonymous ? t.profile.signInToSee : t.profile.notFoundHint}
          action={
            anonymous ? (
              <Link className="btn btn--primary" to={`/entrar?next=${encodeURIComponent(`/p/${handle}`)}`}>
                {t.account.enterProfile}
              </Link>
            ) : undefined
          }
        />
      </div>
    )
  }
  return <ProfileView card={card} tournaments={card.isMe ? links : undefined} />
}

/** `/p/_/:name` (design routes only): the profile on fixture data. */
export function ProfileFixture() {
  const { name = 'yo' } = useParams()
  const f = PROFILE_FIXTURES[name] ?? PROFILE_FIXTURES.yo!
  return <ProfileView card={f.card} tournaments={f.tournaments} />
}

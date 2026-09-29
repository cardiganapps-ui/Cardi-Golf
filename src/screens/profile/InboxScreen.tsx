/**
 * `/avisos`: what happened while you were away, newest first. Opening it
 * marks everything read; new ones keep the accent rule until then. No
 * amounts here, ever: money stays on your own profile.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Spinner, toast } from '../../components/ui'
import { IconBell, IconChevronLeft, IconChevronRight } from '../../components/icons'
import { markNotificationsRead, myNotifications, useUnread, type Notice } from '../../data/social'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'

const S = t.social
const stamp = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** A notice's line and where tapping it goes. */
function noticeLine(n: Notice): { text: string; to: string } {
  const who = n.actor?.displayName ?? S.someone
  const vs = n.actor ? `/p/${n.actor.handle}/vs` : '/amigos'
  switch (n.kind) {
    case 'friend_request':
      return { text: S.notice.friend_request(who), to: '/amigos' }
    case 'friend_accepted':
      return { text: S.notice.friend_accepted(who), to: n.actor ? `/p/${n.actor.handle}` : '/amigos' }
    case 'rivalry_proposed':
      return { text: S.notice.rivalry_proposed(who), to: vs }
    case 'rivalry_accepted':
      return { text: S.notice.rivalry_accepted(who), to: vs }
    case 'rivalry_round':
      return { text: S.notice.rivalry_round(who), to: vs }
    case 'link_pending':
      return { text: S.notice.link_pending(n.data.player ?? '', n.data.tournament ?? ''), to: '/' }
    case 'results': {
      const finish = n.data.rankLabel ? t.profile.finish(n.data.rankLabel, n.data.field ?? null) : null
      return { text: S.notice.results(n.data.tournament ?? '', finish && finish.charAt(0).toLowerCase() + finish.slice(1)), to: n.data.slug ? `/t/${n.data.slug}` : '/' }
    }
    case 'round_invite':
      // Mi Polo carries the "¿Eres tú?" that confirms the player.
      return { text: S.notice.round_invite(who, n.data.tournament ?? ''), to: '/' }
    case 'crew_join':
      return { text: S.notice.crew_join(who, n.data.crew ?? ''), to: n.data.slug ? `/c/${n.data.slug}` : '/crews' }
    default:
      return { text: '', to: '/' }
  }
}

export function InboxScreen({ fixture }: { fixture?: Notice[] }) {
  const ok = useRequireAccount('/avisos', !!fixture)
  const [list, setList] = useState<Notice[] | null>(fixture ?? null)
  const clear = useUnread((s) => s.clear)

  useEffect(() => {
    if (!ok || fixture) return
    let live = true
    myNotifications()
      .then(async (l) => {
        if (!live) return
        setList(l)
        // Shown once as new, then read.
        if (l.some((n) => !n.read)) {
          await markNotificationsRead()
          clear()
        }
      })
      .catch((e) => toast(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [ok, fixture, clear])

  if (!ok || !list) return <Spinner />
  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.iconBtn} aria-label={t.common.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{S.inbox}</h1>
        <span className={styles.iconSpacer} />
      </div>
      {list.length === 0 ? (
        <div className={styles.emptyNote}>
          <IconBell size={28} />
          <p className={styles.help}>{S.noNotices}</p>
        </div>
      ) : (
        <div className={styles.rows}>
          {list.map((n) => {
            const { text, to } = noticeLine(n)
            return (
              <Link key={n.id} to={to} className={`${styles.row} ${n.read ? '' : styles.rowUsed}`}>
                {n.actor ? <Avatar name={n.actor.displayName} url={n.actor.avatarUrl} /> : <span className={styles.mono}>{(n.data.tournament ?? 'P').charAt(0).toUpperCase()}</span>}
                <span className={styles.rowText}>
                  <span className={n.read ? '' : styles.rowTitle}>{text}</span>
                  <span className={styles.rowSub}>{stamp.format(new Date(n.createdAt))}</span>
                </span>
                <span className={styles.rowEnd}>
                  <IconChevronRight size={20} />
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

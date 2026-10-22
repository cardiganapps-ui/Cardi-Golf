/**
 * `/avisos`: what happened while you were away, newest first. Opening it
 * marks everything read; new ones keep the accent rule until then. The
 * app's notices never carry an amount (money stays on your own profile); a
 * notice from the Admin de Polo is his own text (platform_broadcast).
 */
import { useEffect } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, ErrorBox, Spinner } from '../../components/ui'
import { toast } from '../../components/toast'
import { IconBell, IconChevronLeft, IconChevronRight } from '../../components/icons'
import { markNotificationsRead, myNotifications, useUnread, type Notice } from '../../data/social'
import { noticeLine } from '../../lib/noticeText'
import { clearAppBadge } from '../../data/push'
import { PushToggle } from './PushToggle'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'
import { useServerQuery } from '../../data/query'
import { humanError } from '../../lib/humanError'

const S = t.social
const stamp = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function InboxScreen({ fixture }: { fixture?: Notice[] }) {
  const ok = useRequireAccount('/avisos', !!fixture)
  const q = useServerQuery(['notices'], () => myNotifications(), { enabled: ok && !fixture, staleMs: 0 })
  const list = fixture ?? q.data ?? null
  const clear = useUnread((s) => s.clear)
  const unread = !fixture && !!q.data?.some((n) => !n.read)

  // Shown once as new, then read: the list keeps its accent rules until it is read again.
  useEffect(() => {
    if (!unread) return
    void markNotificationsRead()
      .then(() => {
        clear()
        clearAppBadge()
      })
      .catch((e: unknown) => toast(humanError(e)))
  }, [unread, clear])

  if (ok && !list && q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
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
      {!fixture && <PushToggle compact />}
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
                {n.actor ? (
                  <Avatar name={n.actor.displayName} url={n.actor.avatarUrl} />
                ) : (
                  <span className={styles.mono}>{(n.data.tournament ?? 'P').charAt(0).toUpperCase()}</span>
                )}
                <span className={styles.rowText}>
                  {/* Both states are the same row; only the weight differs. It
                      used to be `n.read ? '' : rowTitle`, so a read notice had
                      no truncation and wrapped to three lines. */}
                  <span className={`${styles.rowTitle} ${n.read ? styles.rowTitleRead : ''}`}>{text}</span>
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

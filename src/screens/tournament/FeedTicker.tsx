/**
 * Live feed ticker (§9.2): the latest derived events with light commentary.
 */
import { AnimatePresence, motion } from 'motion/react'
import { t } from '../../i18n/es-MX'
import type { FeedEvent } from '../../engine/core/feed'
import { useTournament } from '../../data/tournamentStore'
import styles from './FeedTicker.module.css'
import type { ReactNode } from 'react'
import { IconBird, IconFlag, IconRing, IconSnake } from '../../components/icons'

function feedText(e: FeedEvent, nameOf: (id: string) => string): string {
  switch (e.kind) {
    case 'birdie':
      return e.points >= 4 ? t.feed.eagle(nameOf(e.playerId), e.hole, e.points) : t.feed.birdie(nameOf(e.playerId), e.hole, e.points, e.gross)
    case 'leadChange':
      return t.feed.leadChange(nameOf(e.playerId), e.total)
    case 'snakePass':
      return t.feed.snakePass(nameOf(e.playerId), e.hole)
    case 'honoreeHole':
      return t.feed.honoreeHole(nameOf(e.playerId), e.hole, e.points)
  }
}

const ICON: Record<FeedEvent['kind'], ReactNode> = { birdie: <IconBird size={18} />, leadChange: <IconFlag size={18} />, snakePass: <IconSnake size={18} />, honoreeHole: <IconRing size={18} /> }

export function FeedTicker({ limit = 8, big = false }: { limit?: number; big?: boolean }) {
  const data = useTournament((s) => s.data)
  if (!data) return null
  const nameOf = (id: string) => data.snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
  const events = data.state.feed.slice(0, limit)
  const key = (e: FeedEvent) => `${e.kind}-${e.roundNumber}-${e.hole}-${e.playerId}`
  return (
    <div className={`${styles.feed} ${big ? styles.big : ''}`}>
      {events.length === 0 && <p className="help">{t.feed.empty}</p>}
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div key={key(e)} layout className={`${styles.item} ${e.kind === 'leadChange' ? styles.lead : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
            <span className={styles.icon} aria-hidden="true">
              {ICON[e.kind]}
            </span>
            <span className={styles.text}>{feedText(e, nameOf)}</span>
            <span className={styles.when}>{t.feed.day(e.roundNumber)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

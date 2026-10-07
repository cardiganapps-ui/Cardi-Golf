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
import { ease } from '../../design/motion'
import { feedKey, feedText } from '../../lib/figureText'

const ICON: Record<FeedEvent['kind'], ReactNode> = { birdie: <IconBird size={18} />, leadChange: <IconFlag size={18} />, snakePass: <IconSnake size={18} />, honoreeHole: <IconRing size={18} /> }

export function FeedTicker({ limit = 8, big = false }: { limit?: number; big?: boolean }) {
  const data = useTournament((s) => s.data)
  if (!data) return null
  const nameOf = (id: string) => data.snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
  const events = data.state.feed.slice(0, limit)
  return (
    <div className={`${styles.feed} ${big ? styles.big : ''}`}>
      {events.length === 0 && <p className="help">{t.feed.empty}</p>}
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div key={feedKey(e)} layout className={`${styles.item} ${e.kind === 'leadChange' ? styles.lead : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease}>
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

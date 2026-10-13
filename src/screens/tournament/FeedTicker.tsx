/**
 * Live feed ticker (§9.2): the latest derived events with light commentary.
 */
import { AnimatePresence, motion } from 'motion/react'
import { t } from '../../i18n/es-MX'
import type { FeedEvent } from '../../engine/core/feed'
import { useBoards } from '../../data/useBoards'
import styles from './FeedTicker.module.css'
import { memo, type ReactNode } from 'react'
import { IconBird, IconFlag, IconRing, IconSnake } from '../../components/icons'
import { ease, easeBoard } from '../../design/motion'
import { feedKey, feedText } from '../../lib/figureText'

const ICON: Record<FeedEvent['kind'], ReactNode> = { birdie: <IconBird size={18} />, leadChange: <IconFlag size={18} />, snakePass: <IconSnake size={18} />, honoreeHole: <IconRing size={18} /> }

/** Memoized: its own lines decide when it renders, not the screen around it (PERF-09). */
export const FeedTicker = memo(function FeedTicker({ limit = 8, big = false }: { limit?: number; big?: boolean }) {
  // The lines as words: a score that changes no line renders no feed (PERF-09).
  const lines = useBoards((data) => {
    if (!data) return null
    const nameOf = (id: string) => data.snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
    return data.state.feed.slice(0, limit).map((e) => ({ key: feedKey(e), kind: e.kind, text: feedText(e, nameOf), round: e.roundNumber }))
  })
  if (!lines) return null
  return (
    <div className={`${styles.feed} ${big ? styles.big : ''}`}>
      {lines.length === 0 && <p className="help">{t.feed.empty}</p>}
      <AnimatePresence initial={false}>
        {lines.map((e) => (
          <motion.div key={e.key} layout className={`${styles.item} ${e.kind === 'leadChange' ? styles.lead : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={big ? easeBoard : ease}>
            <span className={styles.icon} aria-hidden="true">
              {ICON[e.kind]}
            </span>
            <span className={styles.text}>{e.text}</span>
            <span className={styles.when}>{t.feed.day(e.round)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})

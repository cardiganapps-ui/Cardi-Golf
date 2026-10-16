/**
 * Live feed ticker (§9.2): the latest derived events with light commentary.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { t } from '../../i18n/es-MX'
import type { FeedEvent } from '../../engine/core/feed'
import { useBoards } from '../../data/useBoards'
import styles from './FeedTicker.module.css'
import { memo, type ReactNode } from 'react'
import { IconBird, IconFlag, IconRing, IconSnake } from '../../components/icons'
import { ease, easeBoard, still } from '../../design/motion'
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
  // Under reduced motion the lines take their places at once: a height that grows is movement too.
  const reduce = useReducedMotion()
  if (!lines) return null
  return (
    <div className={`${styles.feed} ${big ? styles.big : ''}`}>
      {lines.length === 0 && <p className="help">{t.feed.empty}</p>}
      {/*
        A new line opens at the top as the oldest closes at the bottom, each over the same time and curve, so the
        list holds its height and the page under it stays put (MOT-19). The line that goes fades as it closes; it
        used to hold its room for the whole move and then vanish, the feed a row taller until it did.
      */}
      <AnimatePresence initial={false}>
        {lines.map((e) => (
          <motion.div key={e.key} className={styles.slot} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={reduce ? still : big ? easeBoard : ease}>
            <div className={`${styles.item} ${e.kind === 'leadChange' ? styles.lead : ''}`}>
              <span className={styles.icon} aria-hidden="true">
                {ICON[e.kind]}
              </span>
              <span className={styles.text}>{e.text}</span>
              <span className={styles.when}>{t.feed.day(e.round)}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})

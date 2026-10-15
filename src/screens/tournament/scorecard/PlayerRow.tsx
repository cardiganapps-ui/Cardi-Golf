import { motion } from 'motion/react'
import { memo } from 'react'
import { IconLock, IconSnake } from '../../../components/icons'
import { Stepper } from '../../../components/primitives'
import { easeSlow } from '../../../design/motion'
import type { HoleResult } from '../../../engine/core/types'
import { t } from '../../../i18n/es-MX'
import { haptic } from '../../../lib/haptics'
import type { Draft } from '../tarjetaDrafts'
import styles from '../ScorecardScreen.module.css'

const S = t.card

/**
 * One player on the hole (§9.3): his name with the strokes he receives, the points badge, and the steppers for
 * strokes and putts with «Levantó». Memoized: a tap renders the row it changed, not the group (PERF-09), so
 * every prop is a value the row shows and `onDraft` is the card's one stable handler.
 */
export const PlayerRow = memo(function PlayerRow(p: {
  id: string
  name: string
  /** The element id his name carries: his controls are labelled by it (A11Y-01). */
  labelId: string
  draft: Draft
  hole: HoleResult
  /** The par in the hole's heading: a player whose tee plays it otherwise says so. */
  parOnScreen: number
  locked: boolean
  /** Untouched defaults on a hole he hasn't played: the badge stays quiet and says «Sin capturar» (COPY-10). */
  untouched: boolean
  ptsLine: string
  good: boolean
  /** He carries the snake: the mark slides from the old holder's row to his (MOT-07). */
  holdsSnake: boolean
  snakeLayoutId: string
  onDraft: (pid: string, patch: Partial<Draft>) => void
}) {
  const { id, draft: d, hole: h, name } = p
  return (
    <div className={`${styles.player} ${p.locked ? styles.locked : ''}`} role="group" aria-labelledby={p.labelId}>
      <div className={styles.playerLine}>
        <span className={styles.nameWrap}>
          <span className={styles.playerName}>
            <span className={styles.playerNameText} id={p.labelId}>
              {name}
            </span>
            {p.locked && (
              <span className={styles.lockMark} aria-label={S.cardSigned}>
                <IconLock size={14} />
              </span>
            )}
            {h.strokesReceived > 0 && (
              <span className={styles.dots} aria-label={t.admin.players.strokesOn(h.strokesReceived)}>
                {'•'.repeat(h.strokesReceived)}
              </span>
            )}
          </span>
          {/* Outside the name's clipped box, so it slides from the old holder's row to the new one's (MOT-07). */}
          {p.holdsSnake && (
            <motion.span layoutId={p.snakeLayoutId} className={styles.snakeMark} role="img" aria-label={S.snakeHolder} transition={easeSlow}>
              <IconSnake size={16} />
            </motion.span>
          )}
        </span>
        <span className={`${styles.pts} ${p.untouched ? styles.ptsMuted : p.good ? styles.ptsHigh : ''}`}>
          {p.ptsLine}
          {h.par !== p.parOnScreen ? `, ${S.parHere(h.par)}` : ''}
        </span>
      </div>
      <div className={styles.controls}>
        <Stepper label={S.strokesOf(name)} quiet value={d.strokes} par={h.par} min={1} max={15} disabled={p.locked || d.pickedUp} onChange={(v) => p.onDraft(id, { strokes: v, putts: Math.min(d.putts, v) })} />
        <Stepper label={S.puttsOf(name)} quiet value={d.putts} min={0} max={d.pickedUp ? 15 : d.strokes} disabled={p.locked} onChange={(v) => p.onDraft(id, { putts: v })} />
        <button
          type="button"
          className={styles.pickup}
          disabled={p.locked}
          onClick={() => {
            haptic('tick')
            p.onDraft(id, { pickedUp: !d.pickedUp })
          }}
          aria-pressed={d.pickedUp}
          aria-label={S.pickedUpOf(name)}
        >
          {S.pickedUp}
        </button>
      </div>
    </div>
  )
})

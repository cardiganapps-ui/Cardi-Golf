import { motion, type MotionValue } from 'motion/react'
import { memo, type Ref } from 'react'
import { IconChevronLeft, IconChevronRight } from '../../../components/icons'
import { t } from '../../../i18n/es-MX'
import styles from '../ScorecardScreen.module.css'

const S = t.card

/**
 * The hole's heading (§9.3): its number, par, stroke index and yards, between the arrows. A screen reader hears
 * it as one sentence (A11Y-01); the figures follow a swipe (`dragX`, MOT-02).
 */
export const HoleHeader = memo(function HoleHeader(p: {
  hole: number
  par: number
  strokeIndex: number | undefined
  yards: number | null | undefined
  spoken: string
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  dragX: MotionValue<number>
  titleRef: Ref<HTMLSpanElement>
}) {
  return (
    <header className={styles.holeHead}>
      <button className={styles.holeNav} type="button" onClick={p.onPrev} disabled={!p.canPrev} aria-label={S.prev}>
        <IconChevronLeft />
      </button>
      <h1 className={styles.holeTitle}>
        <span className="sr-only">{p.spoken}</span>
        <motion.span className={`${styles.holeFig} ${styles.swipeArea}`} style={{ x: p.dragX }} aria-hidden="true">
          <span ref={p.titleRef} className={styles.holeFig}>
            <span className={styles.holeNum}>{p.hole}</span>
            <span className={styles.holeMeta}>
              {t.player.par} {p.par}, {t.player.si} {p.strokeIndex ?? '–'}
              {p.yards ? `, ${t.player.yards(p.yards)}` : ''}
            </span>
          </span>
        </motion.span>
      </h1>
      <button className={styles.holeNav} type="button" onClick={p.onNext} disabled={!p.canNext} aria-label={S.next}>
        <IconChevronRight />
      </button>
    </header>
  )
})

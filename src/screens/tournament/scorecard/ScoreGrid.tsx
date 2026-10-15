import { memo } from 'react'
import { IconAlert } from '../../../components/icons'
import { ScoreMark, markFor } from '../../../components/primitives'
import type { HoleResult, PlayerRound } from '../../../engine/core/types'
import { holeStrokes } from '../../../engine/formats'
import { t } from '../../../i18n/es-MX'
import { SaveStatus } from './SaveBar'
import type { SavedNote } from './useHoleSave'
import styles from '../ScorecardScreen.module.css'

const S = t.card

const holeOf = (r: Record<string, PlayerRound>, pid: string, h: number): HoleResult | undefined => r[pid]?.holes[h - 1]

/**
 * The whole card at once (§9.3): every hole of the round by every player, in pencil notation, with each nine's
 * and the day's sums and the holes still missing highlighted. A hole's number opens it. Memoized: it renders
 * when the boards or the card's own state change, not on a stepper (PERF-09).
 */
export const ScoreGrid = memo(function ScoreGrid(p: {
  /** The group's players, with the names the card gives them. */
  named: ReadonlyArray<{ id: string; name: string }>
  roundState: Record<string, PlayerRound>
  /** The holes in the group's play order. */
  order: readonly number[]
  /** The hole on screen in the hole view. */
  hole: number
  /** Whether anything counts Stableford points; else net strokes (`net`) or gross. */
  pointsCount: boolean
  net: boolean
  onOpen: (hole: number) => void
  savedNote: SavedNote | null
  onUndo: () => void
}) {
  const { named, roundState, order, pointsCount, net } = p
  const leadId = named[0]?.id
  const leadHole = (h: number) => (leadId ? holeOf(roundState, leadId, h) : undefined)
  const front = order.filter((h) => h <= 9).sort((a, b) => a - b)
  const back = order.filter((h) => h > 9).sort((a, b) => a - b)
  const sumPts = (pid: string, holes: number[]) => holes.reduce((a, h) => a + (holeOf(roundState, pid, h)?.played ? (holeOf(roundState, pid, h)?.points ?? 0) : 0), 0)
  /** Under net strokes the small figure is the net score; under gross the mark already says it all. */
  const cellFigure = (hi: HoleResult) => (pointsCount ? hi.points : net ? holeStrokes(hi, true) : null)
  const sumNet = (pid: string, holes: number[]) => {
    const hs = holes.map((h) => holeOf(roundState, pid, h)).filter((h): h is HoleResult => !!h?.played)
    return hs.length === holes.length ? hs.reduce((a, h) => a + (holeStrokes(h, true) ?? 0), 0) : null
  }
  const sumGross = (pid: string, holes: number[]) => {
    const hs = holes.map((h) => holeOf(roundState, pid, h)).filter((h): h is HoleResult & { gross: number } => !!h?.played && !h.pickedUp && h.gross != null)
    return hs.length === holes.length ? hs.reduce((a, h) => a + h.gross, 0) : null
  }
  const missing = named.some((pl) => order.some((h) => !holeOf(roundState, pl.id, h)?.played))
  const disputed = named.some((pl) => roundState[pl.id]?.holes.some((h) => h.disputed))
  const gridRow = (h: number) => (
    <tr key={h}>
      <td>
        <button type="button" className={`${styles.holeBtn} ${h === p.hole ? styles.holeCurrent : ''}`} onClick={() => p.onOpen(h)}>
          {h}
        </button>
      </td>
      <td className={styles.gridMeta}>{leadHole(p.hole) ? (leadHole(h)?.par ?? '') : ''}</td>
      <td className={styles.gridMeta}>{leadHole(h)?.strokeIndex ?? ''}</td>
      {named.map((pl) => {
        const hi = holeOf(roundState, pl.id, h)
        if (!hi?.played) {
          return (
            <td key={pl.id} className={styles.missing}>
              –
            </td>
          )
        }
        return (
          <td key={pl.id}>
            <span className={styles.cell}>
              <ScoreMark value={hi.pickedUp ? 'L' : (hi.gross ?? '–')} kind={markFor(hi.gross, hi.par, hi.pickedUp)} />
              <span className={styles.cellPts}>
                {cellFigure(hi)}
                {hi.disputed && (
                  <span className={styles.disputedMark} aria-label={S.disputed}>
                    <IconAlert size={12} />
                  </span>
                )}
              </span>
            </span>
          </td>
        )
      })}
    </tr>
  )
  const subtotalRow = (label: string, holes: number[], total = false) => (
    <tr className={total ? styles.total : styles.subtotal}>
      <td>
        {label}
        <span className={styles.subCaption}>{pointsCount ? S.ptsGrossCaption : net ? S.netGrossCaption : S.grossCaption}</span>
      </td>
      <td className={styles.gridMeta}>{holes.reduce((a, h) => a + (leadHole(h)?.par ?? 0), 0) || ''}</td>
      <td />
      {named.map((pl) => {
        const g = sumGross(pl.id, holes)
        return (
          <td key={pl.id}>
            <span className={styles.cell}>
              <span>{pointsCount ? sumPts(pl.id, holes) : net ? (sumNet(pl.id, holes) ?? '–') : ''}</span>
              <span className={styles.cellPts}>{g ?? ''}</span>
            </span>
          </td>
        )
      })}
    </tr>
  )
  return (
    <>
      {/* The whole card's name, where focus lands when the card turns to it (A11Y-12). */}
      <h1 className="sr-only" data-view-heading>
        {S.gridHeading}
      </h1>
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th>{t.player.hole}</th>
              <th className={styles.gridMeta}>{t.player.par}</th>
              <th className={styles.gridMeta}>{t.player.si}</th>
              {named.map((pl) => (
                <th key={pl.id}>{pl.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {front.map(gridRow)}
            {back.length > 0 && subtotalRow(S.front, front)}
            {back.map(gridRow)}
            {back.length > 0 && subtotalRow(S.back, back)}
            {subtotalRow(t.common.total, [...order], true)}
          </tbody>
        </table>
      </div>
      <div className={styles.gridNotes}>
        <SaveStatus savedNote={p.savedNote} onUndo={p.onUndo} />
        {missing && <span className="help">{S.missingHoles}</span>}
        {disputed && <span className="help">{S.disputedHint}</span>}
      </div>
    </>
  )
})

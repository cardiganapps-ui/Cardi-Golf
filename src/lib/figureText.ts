/**
 * The main event's figures as copy, the same on every screen (STRAT-03).
 *
 * A decided match reads the same for both sides («8&6»), so wherever a day's
 * result is printed it says whose it was («ganó 8&6»). A player of a team
 * format has his own card under the team's figure: his day is his own score
 * against par, not the team's.
 */
import { t } from '../i18n/es-MX'
import { holeStrokes, toParText, type Figure, type MainScoring } from '../engine/formats'
import type { HoleResult, PlayerRound } from '../engine/core/types'
import type { FeedEvent } from '../engine/core/feed'

/** A day's figure, with the side of a decided match: «ganó 8&6», «perdió 2&1», «Empate», «−3». */
export function dayFigureText(f: Figure): string {
  return f.result ? t.live.matchDay(f.result, f.text) : f.text
}

/**
 * One player's own day, with its unit: Stableford points, or his strokes
 * against par over the holes he played («+3 neto»); null with no hole played.
 */
export function ownDayText(pr: PlayerRound, scoring: MainScoring): string | null {
  if (scoring === 'points') return pr.thru > 0 ? t.common.figure(String(pr.points), pr.points, 'points') : null
  let toPar = 0
  let played = 0
  for (const h of pr.holes) {
    const s = holeStrokes(h, scoring === 'net')
    if (s == null) continue
    toPar += s - h.par
    played++
  }
  return played ? t.common.figure(toParText(toPar), toPar, scoring) : null
}

/**
 * How a hole is marked on a card: good (a birdie or better), bad (no points;
 * under strokes, a double bogey or worse) or plain. Under strokes it is the
 * score the event counts against par, never the Stableford points: a gross
 * par with a stroke received is three points, and a plain par on a gross card.
 */
export function holeMark(h: HoleResult, scoring: MainScoring): 'good' | 'bad' | null {
  if (!h.played) return null
  if (scoring === 'points') return h.points >= 3 ? 'good' : h.points === 0 ? 'bad' : null
  const toPar = (holeStrokes(h, scoring === 'net') ?? h.par) - h.par
  return toPar <= -1 ? 'good' : toPar >= 2 ? 'bad' : null
}

/** A feed event as a line of the ticker, in the figure the event counts (STRAT-03). */
export function feedText(e: FeedEvent, nameOf: (id: string) => string): string {
  switch (e.kind) {
    case 'birdie':
      // Points only where the event counts them.
      if (e.scoring !== 'points') return t.feed.underPar(nameOf(e.playerId), e.hole, e.under, e.scoring === 'net')
      return e.points >= 4 ? t.feed.eagle(nameOf(e.playerId), e.hole, e.points) : t.feed.birdie(nameOf(e.playerId), e.hole, e.points, e.gross)
    case 'leadChange':
      return t.feed.leadChange(nameOf(e.playerId), e.figure)
    case 'snakePass':
      return t.feed.snakePass(nameOf(e.playerId), e.hole)
    case 'honoreeHole':
      return e.scoring === 'points' ? t.feed.honoreeHole(nameOf(e.playerId), e.hole, e.points) : t.feed.honoreeToPar(nameOf(e.playerId), e.hole, e.toPar, e.scoring === 'net')
  }
}

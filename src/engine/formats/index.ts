/**
 * The format registry. `settings.modules.individual.format` picks one; the
 * main-event module runs it and knows nothing else about it.
 */
import type { TournamentSettings } from '../settings/schema'
import type { FormatId, MainFormat } from './format'
import { matchPlayFormat } from './matchPlay'
import { stablefordFormat } from './stableford'
import { strokePlayFormat } from './strokePlay'
import { teamFormat } from './team'

export const ALL_FORMATS: Record<FormatId, MainFormat> = {
  stableford: stablefordFormat,
  strokePlay: strokePlayFormat,
  matchPlay: matchPlayFormat,
  team: teamFormat,
}

/**
 * The tournament's format. Falls back to Stableford for a settings row written
 * by a newer app than this one, so an old build shows a board rather than
 * nothing — the flags carry the mismatch.
 */
export function formatFor(settings: TournamentSettings): MainFormat {
  return ALL_FORMATS[settings.modules.individual.format] ?? stablefordFormat
}

/**
 * What the main event counts, for everything that talks about it besides the
 * board (the feed, the stats, the share card): Stableford points, or strokes,
 * net or gross. Team play counts points or strokes as the tournament set it.
 */
export type MainScoring = 'points' | 'net' | 'gross'
export function mainScoring(settings: TournamentSettings): MainScoring {
  const { format, formatOptions } = settings.modules.individual
  if (format === 'stableford' || (format === 'team' && formatOptions.teamScoring === 'stableford')) return 'points'
  return formatOptions.scoring === 'gross' ? 'gross' : 'net'
}

/** What a main-event figure is, to write its unit: points, strokes net or gross, or match points. */
export type FigureKind = MainScoring | 'match'
export function figureKind(settings: TournamentSettings): FigureKind {
  return settings.modules.individual.format === 'matchPlay' ? 'match' : mainScoring(settings)
}

/**
 * Whether one player's running total is what the board ranks: true for
 * Stableford and stroke play, false where the board ranks teams or matches,
 * so a "leader" made of one player's points or strokes would not be the
 * board's leader.
 */
export function ranksPlayersByTotal(settings: TournamentSettings): boolean {
  const format = settings.modules.individual.format
  return format === 'stableford' || format === 'strokePlay'
}

export * from './format'
export { matchPointsText, playMatches, type MatchResult } from './matchPlay'
export { holeStrokes, strokesWhy } from './strokePlay'

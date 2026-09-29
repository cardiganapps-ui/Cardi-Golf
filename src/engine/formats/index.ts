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

export * from './format'
export { matchPointsText, playMatches, type MatchResult } from './matchPlay'
export { holeStrokes } from './strokePlay'

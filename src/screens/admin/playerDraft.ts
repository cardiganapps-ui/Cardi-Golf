import type { PlayerInput } from '../../data/api'
import type { EstimateInput } from '../../engine/types'

/** A gross score of the estimate nobody has typed yet. */
export type DraftEstimate = Omit<EstimateInput, 'gross'> & { gross: number | null }
/**
 * The sheet's player: a new one's handicap is empty until someone types it,
 * by whichever method (UX-16). It opened on 18, the estimate on 85, 92 and
 * 100, and «Índice» with nothing typed saved 0: a number nobody gave.
 */
export type PlayerDraft = Omit<PlayerInput, 'base_hcp' | 'estimate_inputs'> & { base_hcp: number | null; estimate_inputs: [DraftEstimate, DraftEstimate, DraftEstimate] | null }

/** The player to save, once the chosen method has its number; null until then. */
export function completePlayer(d: PlayerDraft): PlayerInput | null {
  const est = d.estimate_inputs
  const scores = est && est.every((r) => r.gross != null) ? (est as [EstimateInput, EstimateInput, EstimateInput]) : null
  if (d.handicap_source === 'manual' && d.base_hcp == null) return null
  if (d.handicap_source === 'index' && d.handicap_index == null) return null
  if (d.handicap_source === 'estimate' && !scores) return null
  // `base_hcp` of an index or an estimate is what they work out to, set when it is saved.
  return { ...d, base_hcp: d.base_hcp ?? 0, estimate_inputs: scores }
}

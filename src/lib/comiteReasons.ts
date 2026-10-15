/**
 * A hole the Comité decided, in the card's words (TRUST-14). A Comité write always leaves a reason on the score
 * (a write that is not the Comité's clears it, 0010), and when the Comité typed none the server writes one of its
 * own: a correction's default (admin_save_score) or a discrepancy's outcome (resolve_score_dispute), both 0026.
 * Those are said as what happened; a reason the Comité typed is quoted as it wrote it.
 */
import { t } from '../i18n/es-MX'

/** As the server writes them (supabase/migrations/0026_save_hole.sql; comiteReasons.test.ts reads them there). */
export const COMITE_REASONS = {
  correction: 'Corrección del Comité',
  kept: 'Discrepancia: se conserva el valor actual',
  restored: 'Discrepancia: se restaura el valor anterior',
} as const

export type ComiteDecision = { kind: keyof typeof COMITE_REASONS } | { kind: 'typed'; reason: string }

export function comiteDecision(reason: string): ComiteDecision {
  const r = reason.trim()
  if (r === COMITE_REASONS.correction) return { kind: 'correction' }
  if (r === COMITE_REASONS.kept) return { kind: 'kept' }
  if (r === COMITE_REASONS.restored) return { kind: 'restored' }
  return { kind: 'typed', reason: r }
}

/** «Hoyo 7, Ana: lo corrigió el Comité. «Se apuntó un 6»», the name only where the list has more than one player. */
export function correctionLine(hole: number, name: string | null, reason: string): string {
  const at = t.card.correctionAt(hole, name)
  const d = comiteDecision(reason)
  switch (d.kind) {
    case 'correction':
      return t.card.correctionPlain(at)
    case 'kept':
      return t.card.correctionKept(at)
    case 'restored':
      return t.card.correctionRestored(at)
    case 'typed':
      return t.card.correctionTyped(at, d.reason)
  }
}

/** What a step of the card's history adds after its value: the Comité's typed reason, or what it decided. */
export function historyWhy(reason: string | null): string | null {
  if (!reason) return null
  const d = comiteDecision(reason)
  switch (d.kind) {
    case 'correction':
      return null
    case 'kept':
      return t.card.history.kept
    case 'restored':
      return t.card.history.restored
    case 'typed':
      return t.card.history.typed(d.reason)
  }
}

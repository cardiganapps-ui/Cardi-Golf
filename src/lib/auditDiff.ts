/**
 * What one audit entry changed, for the Comité's Historial: an update's
 * changed fields, or the row an insert added / a delete removed, without
 * the bookkeeping columns that change on every write.
 */
import type { AuditEntry } from '../data/api'

// handicap_note is the record a lock keeps (0046): its reason is the entry's own, shown above the fields.
// A score's version, device and mutation (0026), the row's tournament (0030), a signature's generated card (0054),
// a contest claim's generated source (0042) and a decision's call (0027) are bookkeeping too (TRUST-19).
// A tournament's `timezone` and `currency` columns are its settings' mirror (0074, ARCH-06): the settings say the change.
const NOISE = new Set([
  'updated_at',
  'client_ts',
  'created_at',
  'id',
  'handicap_note',
  'version',
  'device_id',
  'mutation_id',
  'tournament_id',
  'card_id',
  'source',
  'call_id',
  'timezone',
  'currency',
])

export function changedFields(
  e: Pick<AuditEntry, 'action' | 'before' | 'after'>,
): Array<{ key: string; before: unknown; after: unknown }> {
  const b = e.before ?? {}
  const af = e.after ?? {}
  const keys = [...new Set([...Object.keys(b), ...Object.keys(af)])].filter((k) => !NOISE.has(k))
  const out = keys.map((key) => ({ key, before: b[key], after: af[key] }))
  if (e.action === 'UPDATE') return out.filter((f) => JSON.stringify(f.before) !== JSON.stringify(f.after))
  return out.filter((f) => (e.action === 'INSERT' ? f.after : f.before) != null)
}

/** A value short enough for one line. */
export function showValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 60 ? `${s.slice(0, 57)}…` : s
  }
  if (typeof v === 'string') return v
  return typeof v === 'number' || typeof v === 'bigint' ? String(v) : '—'
}

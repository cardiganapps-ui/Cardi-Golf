/** Types for scripts/audit.mjs (its tests import it). */
export interface AuditFinding {
  name: string
  severity: string
  advisories: Array<{ title: string; url: string }>
  through: string[]
}
export type AuditVerdict = { kind: 'clean' } | { kind: 'vulnerable'; findings: AuditFinding[] } | { kind: 'unreachable'; reason: string }
export declare const AUDIT_ARGS: string[]
export declare function auditVerdict(stdout: string): AuditVerdict
export declare function findingLines(findings: AuditFinding[]): string[]
export declare function annotation(level: 'error' | 'warning', message: string): string
export declare function runAudit(options: {
  run: () => string
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
  tries?: number
  waitMs?: number
}): Promise<number>

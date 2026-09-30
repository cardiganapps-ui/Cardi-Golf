import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The quality ledger (docs/quality/ledger.json) tracks every finding of the
// 2026-09-30 review until it is closed. A finding only counts as closed when
// the PR that fixed it is recorded and a test (or an automated check) proves
// it; this test keeps the ledger honest.

const root = process.cwd()
const ledger = JSON.parse(readFileSync(resolve(root, 'docs/quality/ledger.json'), 'utf8')) as {
  source: string
  workstreams: Record<string, string>
  findings: Array<{
    id: string
    severity: string
    area: string
    title: string
    workstream: string
    phase: number
    tripSafe: boolean
    status: string
    pr: number | null
    tests: string[]
    verifiedBy: string | null
    residual: string | null
  }>
}
const source = JSON.parse(readFileSync(resolve(root, ledger.source), 'utf8')) as Array<{ id: string; severity: string }>

describe('quality ledger', () => {
  it('holds every review finding exactly once, with its severity', () => {
    const ids = ledger.findings.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(source.map((f) => f.id).sort())
    const severity = new Map(source.map((f) => [f.id, f.severity]))
    for (const f of ledger.findings) expect(f.severity, f.id).toBe(severity.get(f.id))
  })

  it('uses known statuses, phases and workstreams', () => {
    for (const f of ledger.findings) {
      expect(['open', 'fixed', 'verified', 'waived'], f.id).toContain(f.status)
      expect([0, 1, 2, 3], f.id).toContain(f.phase)
      expect(Object.keys(ledger.workstreams), f.id).toContain(f.workstream)
    }
  })

  it('closes a finding only with its PR and a test that exists', () => {
    for (const f of ledger.findings.filter((x) => x.status === 'fixed' || x.status === 'verified')) {
      expect(f.pr, `${f.id} needs the PR number that fixed it`).toBeTypeOf('number')
      expect(f.tests.length, `${f.id} needs at least one test or check`).toBeGreaterThan(0)
      for (const t of f.tests) expect(existsSync(resolve(root, t)), `${f.id}: ${t} does not exist`).toBe(true)
    }
    for (const f of ledger.findings.filter((x) => x.status === 'verified')) {
      expect(f.verifiedBy, `${f.id} needs the verifier's note`).toBeTruthy()
    }
  })

  it('waives only with a recorded reason', () => {
    for (const f of ledger.findings.filter((x) => x.status === 'waived')) {
      expect(f.residual, `${f.id} needs Diego's written reason`).toBeTruthy()
    }
  })
})

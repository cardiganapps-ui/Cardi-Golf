/**
 * QA-21's audit in CI (scripts/audit.mjs), on reports shaped as npm 10 prints them. PR 208's check failed with
 * only «exit code 1» on a lockfile that passed before and after: the step now tells a finding from an advisory
 * service that gave no report, tries the latter again, never passes it, and says why on the check run.
 */
import { describe, expect, it } from 'vitest'
import { annotation, AUDIT_ARGS, auditVerdict, findingLines, runAudit } from '../../scripts/audit.mjs'

const clean = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, dependencies: { prod: 93, dev: 783, total: 876 } },
})

const advisory = (severity: string, title: string, url: string) => ({ source: 1, name: 'x', dependency: 'x', title, url, severity, range: '<9' })

/** Trimmed from the dev tree's real report (2026-10-15). */
const vulnerable = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    '@fastify/busboy': {
      name: '@fastify/busboy',
      severity: 'high',
      via: [
        advisory('high', '@fastify/busboy vulnerable to Denial of Service', 'https://github.com/advisories/GHSA-x8mw-p69m-v3mx'),
        advisory('moderate', '@fastify/busboy vulnerable to CRLF injection', 'https://github.com/advisories/GHSA-gxm5-99cw-xjw9'),
      ],
    },
    micromatch: { name: 'micromatch', severity: 'high', via: ['braces'] },
    ajv: { name: 'ajv', severity: 'moderate', via: [advisory('moderate', 'ajv has ReDoS', 'https://github.com/advisories/GHSA-2g4f-4pwh-qvx6')] },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 2, critical: 0, total: 3 } },
})

/** What npm prints when the advisory service can't be reached (the registry pointed at a closed port). */
const unreachable = JSON.stringify({
  message: 'request to http://127.0.0.1:9/-/npm/v1/security/audits/quick failed, reason: connect ECONNREFUSED 127.0.0.1:9',
  error: { summary: '', detail: '' },
})

describe('one run of npm audit', () => {
  it('runs QA-21’s command, on what ships only, as JSON', () => {
    expect(AUDIT_ARGS).toEqual(['audit', '--omit=dev', '--audit-level=high', '--json'])
  })

  it('a report with nothing high or critical is clean, a moderate one included', () => {
    expect(auditVerdict(clean)).toEqual({ kind: 'clean' })
    const moderateOnly = JSON.parse(vulnerable) as { vulnerabilities: Record<string, unknown> }
    delete moderateOnly.vulnerabilities['@fastify/busboy']
    delete moderateOnly.vulnerabilities.micromatch
    expect(auditVerdict(JSON.stringify(moderateOnly))).toEqual({ kind: 'clean' })
  })

  it('a high finding names each advisory, and a package vulnerable through another names that one', () => {
    const verdict = auditVerdict(vulnerable)
    expect(verdict.kind).toBe('vulnerable')
    if (verdict.kind !== 'vulnerable') return
    expect(findingLines(verdict.findings)).toEqual([
      '@fastify/busboy (high): @fastify/busboy vulnerable to Denial of Service https://github.com/advisories/GHSA-x8mw-p69m-v3mx',
      'micromatch (high), through braces',
    ])
  })

  it('no report is never clean: the service’s refusal, an empty answer, text, a report without its list', () => {
    expect(auditVerdict(unreachable)).toEqual({ kind: 'unreachable', reason: expect.stringContaining('ECONNREFUSED') })
    expect(auditVerdict('')).toEqual({ kind: 'unreachable', reason: 'npm audit printed nothing' })
    expect(auditVerdict('npm error audit endpoint returned an error\n')).toEqual({ kind: 'unreachable', reason: 'npm error audit endpoint returned an error' })
    expect(auditVerdict('null').kind).toBe('unreachable')
    expect(auditVerdict(JSON.stringify({ auditReportVersion: 2 })).kind).toBe('unreachable')
  })
})

describe('the annotation', () => {
  it('is a workflow command whose message keeps its own percent signs and lines', () => {
    expect(annotation('error', '100% sure\nsecond line')).toBe('::error title=npm audit::100%25 sure%0Asecond line')
  })
})

describe('the step', () => {
  const step = (answers: string[], tries?: number) => {
    const log: string[] = []
    const waits: number[] = []
    let runs = 0
    const done = runAudit({
      run: () => answers[runs++] ?? '',
      sleep: async (ms) => void waits.push(ms),
      log: (line) => void log.push(line),
      tries,
      waitMs: 10,
    })
    return done.then((code) => ({ code, log, waits, runs }))
  }

  it('clean on the first answer passes, with no wait', async () => {
    expect(await step([clean])).toMatchObject({ code: 0, runs: 1, waits: [] })
  })

  it('a finding fails at once, each line an error on the check run; it is never asked again', async () => {
    const { code, log, runs } = await step([vulnerable, clean])
    expect(code).toBe(1)
    expect(runs).toBe(1)
    expect(log.filter((l) => l.startsWith('::error title=npm audit::'))).toHaveLength(2)
  })

  it('no report is asked again, waiting longer each time, and passes once the service answers clean', async () => {
    const { code, log, waits, runs } = await step([unreachable, '', clean])
    expect(code).toBe(0)
    expect(runs).toBe(3)
    expect(waits).toEqual([10, 20])
    expect(log.filter((l) => l.startsWith('::warning title=npm audit::'))).toHaveLength(2)
  })

  it('no report on every try fails, saying why', async () => {
    const { code, log, runs } = await step([unreachable, unreachable, unreachable, clean])
    expect(code).toBe(1)
    expect(runs).toBe(3)
    expect(log.at(-1)).toMatch(/^::error title=npm audit::npm's advisory service gave no report in 3 tries: .*ECONNREFUSED/)
  })

  it('a finding after a try with no report still fails', async () => {
    expect(await step([unreachable, vulnerable])).toMatchObject({ code: 1, runs: 2 })
  })
})

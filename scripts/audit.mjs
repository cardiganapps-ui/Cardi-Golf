#!/usr/bin/env node
/**
 * QA-21: a known high or critical vulnerability in what ships (the production dependencies) fails `check`.
 * npm's advisory service sometimes doesn't answer: PR 208's check failed with nothing but «exit code 1», on the
 * lockfile that had passed eight minutes before and passed again by hand. A run it can't read is tried again,
 * twice, and never counts as a pass. Each failure says why as an annotation on the check run, since a job's log
 * can't always be read.
 *   node scripts/audit.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** QA-21's command, with the report as JSON so a refusal and a finding read apart. */
export const AUDIT_ARGS = ['audit', '--omit=dev', '--audit-level=high', '--json']

const FAILING = new Set(['high', 'critical'])

/** What one run of `npm audit … --json` said: clean, vulnerable (high or critical), or no report at all. */
export function auditVerdict(stdout) {
  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    return { kind: 'unreachable', reason: stdout.trim().split('\n').pop() || 'npm audit printed nothing' }
  }
  if (!report || typeof report !== 'object' || report.error || !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    return { kind: 'unreachable', reason: String(report?.message || report?.error?.summary || 'npm audit gave no report') }
  }
  const findings = []
  for (const [name, v] of Object.entries(report.vulnerabilities)) {
    if (!FAILING.has(v?.severity)) continue
    const via = Array.isArray(v.via) ? v.via : []
    findings.push({
      name,
      severity: v.severity,
      advisories: via.filter((x) => x && typeof x === 'object' && FAILING.has(x.severity)).map((a) => ({ title: String(a.title ?? ''), url: String(a.url ?? '') })),
      through: via.filter((x) => typeof x === 'string'),
    })
  }
  return findings.length ? { kind: 'vulnerable', findings } : { kind: 'clean' }
}

/** One line per advisory; a package that is vulnerable only through another names it. */
export function findingLines(findings) {
  return findings.flatMap((f) =>
    f.advisories.length
      ? f.advisories.map((a) => `${f.name} (${f.severity}): ${a.title} ${a.url}`.trim())
      : [`${f.name} (${f.severity}), through ${f.through.join(', ') || 'a dependency'}`],
  )
}

/** A workflow command: GitHub shows the line on the check run, where the API can read it. */
export function annotation(level, message) {
  return `::${level} title=npm audit::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`
}

/** The audit, tried up to `tries` times while the service gives no report; returns the exit code. */
export async function runAudit({ run, sleep, log, tries = 3, waitMs = 15_000 }) {
  for (let attempt = 1; ; attempt++) {
    const verdict = auditVerdict(run())
    if (verdict.kind === 'clean') {
      log('✓ npm audit: no high or critical vulnerability in the production dependencies')
      return 0
    }
    if (verdict.kind === 'vulnerable') {
      for (const line of findingLines(verdict.findings)) log(annotation('error', line))
      log('npm audit --omit=dev prints the whole report; npm audit fix, or the Dependabot PR, brings the fix.')
      return 1
    }
    if (attempt >= tries) {
      log(annotation('error', `npm's advisory service gave no report in ${tries} tries: ${verdict.reason}`))
      return 1
    }
    log(annotation('warning', `npm's advisory service gave no report (try ${attempt} of ${tries}): ${verdict.reason}`))
    await sleep(waitMs * attempt)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = () => spawnSync('npm', AUDIT_ARGS, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? ''
  process.exitCode = await runAudit({ run, sleep: (ms) => new Promise((done) => setTimeout(done, ms)), log: (line) => console.log(line) })
}

/**
 * Small operational promises that used to drift silently.
 * - DB-01: the keep-alive must run a real query. GET /rest/v1/ needs a secret
 *   key and answered 401 every day; the RPC reaches Postgres as anon.
 * - QA-23: CI runs the Node major Vercel runs (24.x).
 * - QA-21: nothing updated the dependencies (13 majors behind) and nobody ran
 *   an audit. Dependabot proposes updates weekly; CI fails on a known high or
 *   critical vulnerability in the production dependencies.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('ops', () => {
  it('the keep-alive posts to the app_flags RPC and checks the answer', () => {
    expect(read('.github/workflows/keepalive.yml')).toContain('bash scripts/keepalive.sh')
    const script = read('scripts/keepalive.sh')
    expect(script).toMatch(/-X POST/)
    expect(script).toContain('/rest/v1/rpc/app_flags')
    expect(script).toMatch(/"\$code" = "200"/)
    expect(script).toContain('maintenanceBanner')
  })

  it('CI runs on the Node major Vercel uses', () => {
    expect(read('.nvmrc').trim()).toBe('24')
    expect(read('.github/workflows/ci.yml')).toContain('node-version-file: .nvmrc')
  })

  it('dependencies are proposed weekly, minor and patch together, and a vulnerable production one fails CI', () => {
    const bot = read('.github/dependabot.yml')
    for (const ecosystem of ['npm', 'github-actions']) expect(bot).toContain(`package-ecosystem: ${ecosystem}`)
    expect(bot.match(/interval: weekly/g)).toHaveLength(2)
    expect(bot).toMatch(/update-types: \[minor, patch\]/)
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toContain('npm audit --omit=dev --audit-level=high')
    // After the preflight, in the same job the merge waits on.
    expect(ci.indexOf('npm audit')).toBeGreaterThan(ci.indexOf('bash scripts/preflight.sh'))
  })
})

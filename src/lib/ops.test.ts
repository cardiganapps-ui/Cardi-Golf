/**
 * Small operational promises that used to drift silently.
 * - DB-01: the keep-alive must run a real query. GET /rest/v1/ needs a secret
 *   key and answered 401 every day; the RPC reaches Postgres as anon.
 * - QA-23: CI runs the Node major Vercel runs (24.x).
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
})

/**
 * Small operational promises that used to drift silently.
 * - DB-01: the keep-alive must run a real query. GET /rest/v1/ needs a secret
 *   key and answered 401 every day; the RPC reaches Postgres as anon.
 * - QA-23: CI runs the Node major Vercel runs (24.x).
 * - QA-21: nothing updated the dependencies (13 majors behind) and nobody ran
 *   an audit. Dependabot proposes updates weekly; CI fails on a known high or
 *   critical vulnerability in the production dependencies.
 * - Vercel's Hobby plan builds at most 100 deployments a day, and a preview of
 *   every push to every working branch spent them: on 2026-10-15 and again on
 *   2026-10-16 production's deploy of main was refused («rate limited, retry
 *   in 24 hours»). Working branches (claude/**, dependabot/**) build no
 *   preview; main deploys, and a preview is made on demand (CLAUDE.md §0.4).
 * - React Router 8 needs Node 22.22 (2026-10-22), above the 22.12 `engines` said: `engines` is now held to every
 *   direct dependency's own floor.
 * - ARCH-17: lint read no types, nothing formatted the code and the scripts
 *   were never type-checked. The preflight now runs typed lint, a format check
 *   and a typecheck that covers the scripts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('ops', () => {
  it('the preflight lints with the types, checks the format and type-checks the scripts (ARCH-17)', () => {
    expect(read('scripts/preflight.sh')).toContain('steps=("typecheck" "lint" "format:check" "test" "build")')
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.scripts.lint).toContain('--max-warnings 0')
    expect(pkg.scripts['format:check']).toMatch(/^prettier --check /)
    // Pinned: a release that lays the code out differently comes as its own update.
    expect(pkg.devDependencies.prettier).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.devDependencies['eslint-plugin-react-hooks']).toMatch(/^\^7\./)
    const eslint = read('eslint.config.js')
    for (const rule of ['strictTypeChecked', 'stylisticTypeChecked', 'projectService', 'no-floating-promises'])
      expect(eslint).toContain(rule)
    expect(eslint).not.toMatch(/'@typescript-eslint\/no-(floating|misused)-promises': 'off'/)
    expect(read('.prettierignore')).toContain('src/data/database.types.ts')
    const refs = (JSON.parse(read('tsconfig.json')) as { references: Array<{ path: string }> }).references.map(
      (r) => r.path,
    )
    expect(refs).toContain('./tsconfig.scripts.json')
    const scripts = read('tsconfig.scripts.json')
    expect(scripts).toContain('"checkJs": true')
    expect(scripts).toContain('"scripts/**/*.mjs"')
  })

  it('the keep-alive posts to the app_flags RPC and checks the answer', () => {
    expect(read('.github/workflows/keepalive.yml')).toContain('bash scripts/keepalive.sh')
    const script = read('scripts/keepalive.sh')
    expect(script).toMatch(/-X POST/)
    expect(script).toContain('/rest/v1/rpc/app_flags')
    expect(script).toMatch(/"\$code" = "200"/)
    expect(script).toContain('maintenanceBanner')
  })

  it('working branches build no Vercel preview, so production keeps the daily budget', () => {
    const vercel = JSON.parse(read('vercel.json')) as { git?: { deploymentEnabled?: Record<string, boolean> } }
    expect(vercel.git?.deploymentEnabled).toEqual({ 'claude/**': false, 'dependabot/**': false })
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
    // Vite's family comes as one major (PR 201: Vite 8 alone could not pass), and the two majors that cannot land
    // yet stay out: TypeScript's until typescript-eslint takes it, the Node types' until `engines` moves.
    expect(bot).toMatch(
      /vite:\n\s+patterns: \['vite', 'vitest', '@vitest\/\*', '@vitejs\/\*', 'vite-plugin-pwa'\]\n\s+update-types: \[major\]/,
    )
    for (const held of ['typescript', "'@types/node'"])
      expect(bot).toMatch(
        new RegExp(
          `dependency-name: ${held.replace(/[/.*]/g, '\\$&')}\\n\\s+update-types: \\['version-update:semver-major'\\]`,
        ),
      )
    const pkg = JSON.parse(read('package.json')) as {
      engines: { node: string }
      devDependencies: Record<string, string>
    }
    // The major only: `engines` holds the toolchain's floor too (React Router 8 needs 22.22, Vite 8 and Vitest 5 22.12).
    const major = (range: string) => range.replace(/^\D*/, '').split('.')[0]
    expect(major(pkg.devDependencies['@types/node']!)).toBe(major(pkg.engines.node))
  })

  it('the oldest Node in `engines` runs every direct dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      engines: { node: string }
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const version = (v: string) => v.trim().split('.').map(Number).concat(0, 0).slice(0, 3)
    const atLeast = (a: number[], b: number[]) => {
      for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
      return true
    }
    expect(pkg.engines.node).toMatch(/^>=\d+\.\d+$/)
    const floor = version(pkg.engines.node.slice(2))
    // A range as packages write it: alternatives of `>=x.y.z` (open) or `^x.y.z` (that major).
    const runs = (range: string) =>
      range.split('||').some((alt) => {
        const m = /^\s*(>=|\^)\s*([\d.]+)\s*$/.exec(alt)
        if (!m) throw new Error(`a Node range this test cannot read: ${range}`)
        const want = version(m[2]!)
        return atLeast(floor, want) && (m[1] === '>=' || floor[0] === want[0])
      })
    const behind: string[] = []
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const own = JSON.parse(read(`node_modules/${name}/package.json`)) as { engines?: { node?: string } }
      const range = own.engines?.node
      if (range && !runs(range)) behind.push(`${name} needs Node ${range}`)
    }
    expect(behind).toEqual([])
    const ci = read('.github/workflows/ci.yml')
    // scripts/audit.mjs runs `npm audit --omit=dev --audit-level=high` (src/lib/audit.test.ts holds its command).
    expect(ci).toContain('run: node scripts/audit.mjs')
    // After the preflight, in the same job the merge waits on.
    expect(ci.indexOf('run: node scripts/audit.mjs')).toBeGreaterThan(ci.indexOf('bash scripts/preflight.sh'))
  })
})

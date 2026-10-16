/**
 * Adding surface is a decision, not a side effect (STRAT-01). In the 35 hours
 * after the 2026-09-28 audit, 27k lines of new areas shipped against 3k of
 * hardening, and nothing said which of them the launch needed.
 * `docs/strategy/launch-scope.json` lists every route the router declares and
 * every migration, each with its area, and says which areas the launch counts
 * as done (docs/strategy/README.md). This fails when a change adds a route or a
 * migration the list doesn't name, names an area the list doesn't define, or
 * leaves a line for one that is gone.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Scope {
  areas: Record<string, { launch: boolean | 'partial'; what: string }>
  routes: Record<string, string | string[]>
  migrations: Record<string, string | string[]>
}

const root = process.cwd()
const scope = JSON.parse(readFileSync(join(root, 'docs/strategy/launch-scope.json'), 'utf8')) as Scope

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** Every `path: '…'` the router's modules declare. */
function routePaths(): Set<string> {
  const out = new Set<string>()
  for (const f of files(join(root, 'src/app'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bpath:\s*'([^']+)'/g)) out.add(m[1]!)
  }
  return out
}

const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
const areasOf = (v: string | string[]) => (Array.isArray(v) ? v : [v])

describe('the launch scope', () => {
  it('names every route the router declares, and no route that is gone', () => {
    const declared = routePaths()
    expect(declared.size).toBeGreaterThan(40)
    expect([...declared].filter((p) => !(p in scope.routes)), 'add these routes to docs/strategy/launch-scope.json with their area').toEqual([])
    expect(Object.keys(scope.routes).filter((p) => !declared.has(p)), 'these routes are gone: take them out of the list').toEqual([])
  })

  it('names every migration, and no migration that is gone', () => {
    expect(migrations.filter((f) => !(f in scope.migrations)), 'add these migrations to docs/strategy/launch-scope.json with their area').toEqual([])
    expect(Object.keys(scope.migrations).filter((f) => !migrations.includes(f))).toEqual([])
  })

  it('files each one under an area it defines', () => {
    const lines = [...Object.entries(scope.routes), ...Object.entries(scope.migrations)]
    const unknown = lines.flatMap(([k, v]) => areasOf(v).filter((a) => !(a in scope.areas)).map((a) => `${k}: ${a}`))
    expect(unknown).toEqual([])
    for (const [name, a] of Object.entries(scope.areas)) {
      expect([true, false, 'partial'], name).toContain(a.launch)
      expect(a.what.length, name).toBeGreaterThan(20)
    }
  })

  it('keeps the trip path inside the launch', () => {
    for (const p of ['t/:slug', 'tarjeta', 'dinero', 'tv', 'ceremonia', 'v/:token', 'organizer/new', 'calcutta']) {
      expect(areasOf(scope.routes[p]!).some((a) => scope.areas[a]!.launch === true), p).toBe(true)
    }
  })
})

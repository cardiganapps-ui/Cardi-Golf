/**
 * The platform admin's RPCs are the only way into platform-level data, so
 * each one has to refuse everyone else before doing anything. This reads the
 * migrations and holds every `public.platform_*` function (its latest
 * definition) to the same shape:
 *
 *   - security definer, with search_path pinned;
 *   - the first statement after `begin` is the is_platform_admin() guard,
 *     raising 42501;
 *   - execute revoked from public and anon (the internal helpers: from
 *     authenticated too, since only other definer functions call them).
 *
 * It also checks the platform tables have RLS on and no policies (nothing
 * reads them except through those functions), and that the admin's email
 * appears in exactly one place: the seed in the migration that created the
 * table.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'supabase/migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }))
const all = files.map((f) => f.sql).join('\n')

/** Internal: called only from other security definer functions. */
const INTERNAL = new Set(['platform_can_write', 'platform_log', 'platform_person_target', 'platform_refresh_rounds_on'])
const TABLES = ['platform_admins', 'platform_unlocks', 'platform_audit_log']

/** name → latest `create or replace function` text, up to its closing $$; */
function latestDefinitions(): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of all.matchAll(/create or replace function public\.(platform_[a-z_]+)\s*\([\s\S]*?\n\$\$;/g)) out.set(m[1]!, m[0])
  return out
}

describe('platform RPCs', () => {
  const defs = latestDefinitions()

  it('there are some (the parser still finds them)', () => {
    expect(defs.size).toBeGreaterThanOrEqual(8)
  })

  it('are security definer with a pinned search_path', () => {
    const bad = [...defs].filter(([, body]) => !/security definer/.test(body) || !/set search_path = public/.test(body)).map(([n]) => n)
    expect(bad).toEqual([])
  })

  it('refuse anyone but the platform admin before doing anything', () => {
    const bad: string[] = []
    for (const [name, body] of defs) {
      if (INTERNAL.has(name)) continue
      const afterBegin = body.split(/\nbegin\n/)[1] ?? ''
      const first = afterBegin.trim().split('\n')[0] ?? ''
      if (!/^if not public\.is_platform_admin\(\) then raise exception '[^']+' using errcode = '42501'; end if;$/.test(first)) bad.push(name)
    }
    expect(bad).toEqual([])
  })

  it('are not executable by anon (nor by anyone, for the internal ones)', () => {
    const bad: string[] = []
    for (const name of defs.keys()) {
      const revokes = [...all.matchAll(new RegExp(`revoke execute on function public\\.${name}\\([^)]*\\) from ([a-z, ]+);`, 'g'))].map((m) => m[1]!)
      const roles = new Set(revokes.flatMap((r) => r.split(',').map((x) => x.trim())))
      const need = INTERNAL.has(name) ? ['public', 'anon', 'authenticated'] : ['public', 'anon']
      if (!need.every((r) => roles.has(r))) bad.push(`${name}: revoked from ${[...roles].join(', ') || 'nobody'}`)
    }
    expect(bad).toEqual([])
  })
})

describe('platform tables', () => {
  it('have RLS on, no policies, and no grants to clients', () => {
    const bad: string[] = []
    for (const table of TABLES) {
      if (!new RegExp(`alter table public\\.${table} enable row level security;`).test(all)) bad.push(`${table}: RLS off`)
      if (new RegExp(`create policy [a-z_]+ on public\\.${table}\\b`).test(all)) bad.push(`${table}: has a policy`)
      if (!new RegExp(`revoke all on public\\.${table} from anon, authenticated;`).test(all)) bad.push(`${table}: not revoked`)
    }
    expect(bad).toEqual([])
  })

  it('the admin is named in one place only: the seed', () => {
    const hits = files.filter((f) => /gaxioladiego@/i.test(f.sql)).map((f) => f.name)
    expect(hits).toEqual(['0021_platform_admin.sql'])
  })
})

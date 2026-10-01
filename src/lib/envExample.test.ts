/**
 * CHAIR-01: every environment variable the code reads is named in
 * .env.example, so a new key (the five web-push ones went missing in #42) is
 * documented in the same PR that starts reading it. Values stay blank.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
/** Set by Vite, Node or Vercel themselves: not configuration anyone has to provide. */
const PLATFORM = new Set(['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR', 'NODE_ENV'])

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) return []
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name) ? [rel] : []
  })
}

function namesRead(source: string): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g)) out.add(m[1]!)
  for (const m of source.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) out.add(m[1]!)
  // `const env = process.env` and then `env.NAME`.
  for (const alias of source.matchAll(/const\s+(\w+)\s*=\s*process\.env\b/g)) {
    for (const m of source.matchAll(new RegExp(`\\b${alias[1]}\\.([A-Z][A-Z0-9_]*)`, 'g'))) out.add(m[1]!)
  }
  return [...out]
}

describe('.env.example documents every variable the code reads', () => {
  const documented = new Set([...readFileSync(join(ROOT, '.env.example'), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!))
  const sources = [...files('api'), ...files('src'), ...files('scripts'), ...files('e2e'), 'vite.config.ts']

  it('finds the variables it is meant to find', () => {
    const all = new Set(sources.flatMap((f) => namesRead(readFileSync(join(ROOT, f), 'utf8'))))
    for (const name of ['VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'CRON_SECRET', 'VAPID_PRIVATE_KEY', 'SUPABASE_URL']) expect(all.has(name), name).toBe(true)
  })

  it('has every one of them', () => {
    const missing: string[] = []
    for (const f of sources) {
      for (const name of namesRead(readFileSync(join(ROOT, f), 'utf8'))) {
        if (PLATFORM.has(name) || name.startsWith('VERCEL_') || documented.has(name)) continue
        missing.push(`${name} (${f})`)
      }
    }
    expect(missing).toEqual([])
  })
})

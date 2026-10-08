/**
 * Where the stack suite runs, and the guard that keeps it on this machine:
 * the suite signs in, writes scores and deletes its tournaments, so it
 * refuses any Supabase or database that is not local (never the hosted
 * project, never a supabase.co host).
 */
import { execFileSync } from 'node:child_process'

/** `vite preview` of the build made for the local stack. */
export const PORT = 4330
export const BASE_URL = `http://127.0.0.1:${PORT}`
/** The local stack's database (`supabase status -o env` → DB_URL); the default is the CLI's own. */
export const DB_URL = process.env.E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
/** The local API the app is built against (`supabase status -o env` → API_URL). */
export const API_URL = process.env.VITE_SUPABASE_URL ?? ''

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Throws unless both the API and the database are on this machine. */
export function assertLocal(): void {
  for (const [name, url] of [
    ['VITE_SUPABASE_URL', API_URL],
    ['E2E_DB_URL', DB_URL],
  ] as const) {
    const host = hostOf(url)
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(
        `${name} must point at the local Supabase stack (127.0.0.1), not ${host || 'an empty value'}. ` +
          'Start it with `supabase start` and export its API_URL, key and DB_URL (see playwright.stack.config.ts).',
      )
    }
  }
}

/**
 * One SQL query against the local database, as the superuser psql connects
 * with. The query returns one JSON value; this returns it parsed.
 */
export function sql<T>(query: string): T {
  const out = execFileSync('psql', [DB_URL, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' })
  return JSON.parse(out.trim()) as T
}

/** A string as an SQL literal. */
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

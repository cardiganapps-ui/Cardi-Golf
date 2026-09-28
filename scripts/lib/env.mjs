// Shared .env.local loader for the repo scripts: KEY=value lines (names may
// contain digits, e.g. R2_ACCOUNT_ID), optional surrounding quotes, comments
// and blank lines ignored. Never overrides a variable already set. Never prints values.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const root = path.resolve(new URL('../..', import.meta.url).pathname)

export function loadEnv(file = path.join(root, '.env.local')) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

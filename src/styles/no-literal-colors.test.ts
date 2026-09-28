/**
 * Every color is declared once, in tokens.css. This test fails when a hex,
 * rgb() or hsl() literal appears anywhere else under src/, except:
 * - PERMANENT: files that hold data, not styling (fixtures, the curated
 *   accent set, which mirrors --chart-1..6).
 * - PENDING: screen files still on the old stylesheet, migrated one by one
 *   in phase 3. Each entry must still contain a literal, so the list cannot
 *   rot: remove the file here when you clean it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const PERMANENT = new Set(['styles/tokens.css', 'design/accents.ts', 'dev/fixtures.ts'])
const PENDING = new Set([
  'components/ShareCard.module.css',
  'screens/admin/AdminAuction.module.css',
  'screens/admin/AdminPlayers.tsx',
  'screens/admin/AdminScores.module.css',
  'screens/tournament/CeremonyScreen.module.css',
  'screens/tournament/PlayerSheet.module.css',
  'screens/tournament/PrintScreen.module.css',
  'screens/tournament/ScorecardScreen.module.css',
  'screens/tournament/ScorecardScreen.tsx',
  'screens/tournament/SnakeBoard.module.css',
  'screens/tournament/TvScreen.module.css',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(css|ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(ROOT).map((p) => relative(ROOT, p))
const hasLiteral = (f: string) => readFileSync(join(ROOT, f), 'utf8').split('\n').some((l) => LITERAL.test(l))

describe('no color literals outside tokens.css', () => {
  it('finds no literal in any file that is not allow-listed', () => {
    const offenders = files.filter((f) => !PERMANENT.has(f) && !PENDING.has(f) && hasLiteral(f))
    expect(offenders, 'move these colors into src/styles/tokens.css').toEqual([])
  })
  it('keeps the PENDING list honest (every entry still has a literal)', () => {
    const stale = [...PENDING].filter((f) => !files.includes(f) || !hasLiteral(f))
    expect(stale, 'remove these from PENDING; they are clean now').toEqual([])
  })
})

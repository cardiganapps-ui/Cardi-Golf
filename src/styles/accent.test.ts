/**
 * VIS-10: inside a tournament there is one accent, the event's. The platform's
 * fairway was a second brand colour on every tournament screen (47 rules
 * against 12 for the event's), so a Vino event had a wine button beside green
 * links, toggles and a green my-row tint. Now `--accent` is the only accent
 * token: :root gives it the fairway, and a tournament's screens put
 * `data-accent` on their root, which redefines it with its tint and wash
 * (tokens.css). This holds that layering in place.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(css|ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(ROOT).map((p) => relative(ROOT, p))
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('one accent inside a tournament (VIS-10)', () => {
  it('has no second accent token: --event-accent is gone', () => {
    expect(files.filter((f) => read(f).includes('--event-accent'))).toEqual([])
  })
  it('lets only tokens.css declare the accent tokens; a screen picks an accent by id, never by value', () => {
    const declares = files.filter(
      (f) =>
        f !== 'styles/tokens.css' && /--accent(-soft|-wash|-ink)?\s*:|'--accent(-soft|-wash|-ink)?':/.test(read(f)),
    )
    expect(declares).toEqual([])
  })
  it('puts the event’s accent on the root of every tournament surface', () => {
    for (const f of [
      'screens/tournament/TournamentShell.tsx',
      'screens/tournament/EnterScreen.tsx',
      'screens/tournament/TvScreen.tsx',
      'screens/tournament/CeremonyScreen.tsx',
    ]) {
      expect(read(f), f).toMatch(/data-accent=\{/)
    }
  })
  it('keeps the platform’s fairway out of every stylesheet but the tokens’ (the race chart’s own slot aside)', () => {
    const fairway = /--chart-1\b|--race-1\b|#1e6b3b/i
    const using = files.filter(
      (f) =>
        f.endsWith('.css') &&
        f !== 'styles/tokens.css' &&
        f !== 'screens/tournament/race/RaceChart.module.css' &&
        fairway.test(read(f)),
    )
    expect(using).toEqual([])
  })
  it('scopes every curated accent in both themes', () => {
    const css = read('styles/tokens.css')
    const ids = [...read('design/accents.ts').matchAll(/id: '([a-z]+)'/g)]
      .map((m) => m[1]!)
      .filter((id) => id !== 'fairway')
    expect(ids).toHaveLength(5)
    for (const id of ids) {
      expect(css, id).toContain(`[data-accent='${id}'] {`)
      expect(css, id).toContain(`:root:not([data-theme='light']) [data-accent='${id}']:not([data-theme='light']) {`)
      expect(css, id).toContain(`:root[data-theme='dark'] [data-accent='${id}']:not([data-theme='light']) {`)
    }
  })
})

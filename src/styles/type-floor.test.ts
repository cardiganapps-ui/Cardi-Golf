/**
 * VIS-24: nothing is set below 12 px (DESIGN_DIRECTION.md). The scale started
 * at 11 (`--fs-2xs`, 19 rules: the tab labels, the board's column heads, the
 * points under each hole) and the share card set 10 px; those are the labels
 * players read in the sun. The token is gone and no stylesheet sets a size
 * under the floor, in pixels or as a clamp's smallest.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(css|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}
const files = walk(ROOT)
  .map((p) => relative(ROOT, p))
  .filter((f) => !f.startsWith('dev/'))
const FLOOR_PX = 12

describe('the type floor (VIS-24)', () => {
  it('has no token under 12 px', () => {
    const css = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8')
    const sizes = [...css.matchAll(/--fs-[a-z0-9]+:\s*([\d.]+)rem/g)].map((m) => Number(m[1]) * 16)
    expect(sizes.length).toBeGreaterThan(5)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(FLOOR_PX)
    expect(css).not.toContain('--fs-2xs')
  })
  it('sets no font under it anywhere', () => {
    const under: string[] = []
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      if (src.includes('--fs-2xs')) under.push(`${f}: --fs-2xs`)
      for (const m of src.matchAll(/font-size:\s*([^;]+);/g)) {
        const smallest = /^clamp\(\s*([\d.]+)px/.exec(m[1]!)?.[1] ?? /^([\d.]+)px$/.exec(m[1]!.trim())?.[1]
        if (smallest && Number(smallest) < FLOOR_PX) under.push(`${f}: font-size: ${m[1]}`)
      }
    }
    expect(under).toEqual([])
  })
})

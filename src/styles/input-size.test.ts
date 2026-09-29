/**
 * iOS Safari zooms the page in when a control smaller than 16px takes focus,
 * and does not zoom back out on blur — the user has to pinch. We do not defend
 * against it with `user-scalable=no`, which would take pinch-zoom away from
 * everyone, so the defence is that no text-accepting control is ever under
 * 16px. This test holds that line: the base rules must state a size, and no
 * rule anywhere may state a smaller one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname
const FLOOR = 16

const tokens = new Map<string, number>()
for (const m of readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8').matchAll(/--(fs-[a-z0-9-]+):\s*([\d.]+)(rem|px)\s*;/g)) {
  tokens.set(m[1]!, m[3] === 'rem' ? Number(m[2]) * 16 : Number(m[2]))
}

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) cssFiles(p, out)
    else if (name.endsWith('.css')) out.push(p)
  }
  return out
}

/** A rule's selector and body, for every top-level-ish block in the sheet. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), body: m[2]! })
  }
  return out
}

/**
 * Smallest px a font-size declaration can resolve to, or null when we cannot
 * tell. `max(16px, …)` is the idiom we use, so it reads as exactly the floor.
 */
function smallestPx(value: string): number | null {
  const v = value.trim()
  if (/^max\(/.test(v)) {
    const parts = [...v.matchAll(/(?:--(fs-[a-z0-9-]+)|([\d.]+)px|([\d.]+)rem)/g)].map((m) =>
      m[1] ? (tokens.get(m[1]) ?? null) : m[2] ? Number(m[2]) : Number(m[3]) * 16,
    )
    if (parts.some((p) => p == null)) return null
    // max() takes the largest of its arguments, so the smallest it can be is
    // the largest hard-coded floor among them.
    return Math.max(...(parts as number[]))
  }
  const token = v.match(/^var\(--(fs-[a-z0-9-]+)\)$/)
  if (token) return tokens.get(token[1]!) ?? null
  const px = v.match(/^([\d.]+)px$/)
  if (px) return Number(px[1])
  const rem = v.match(/^([\d.]+)rem$/)
  if (rem) return Number(rem[1]) * 16
  return null
}

const CONTROL = /(^|[\s,>+~])(\.input|\.select|\.textarea|input|select|textarea)\b/

describe('no control renders under 16px (iOS focus zoom)', () => {
  it('--fs-md is at least the floor, since it is what the controls ask for', () => {
    expect(tokens.get('fs-md')).toBeGreaterThanOrEqual(FLOOR)
  })

  it.each([
    ['styles/global.css', '.input'],
    ['components/primitives.module.css', '.input'],
  ])('%s states a font-size on %s instead of inheriting one', (file, needle) => {
    const stating = rules(readFileSync(join(ROOT, file), 'utf8')).filter(
      (r) => r.selector.split(',').some((s) => s.trim() === needle) && /font(-size)?\s*:/.test(r.body),
    )
    expect(stating.length, `${file} must pin a font-size on ${needle}`).toBeGreaterThan(0)
  })

  it('no rule anywhere sizes a control below the floor', () => {
    const offenders: string[] = []
    for (const file of cssFiles(ROOT)) {
      for (const rule of rules(readFileSync(file, 'utf8'))) {
        if (!CONTROL.test(rule.selector)) continue
        for (const d of rule.body.matchAll(/font-size:\s*([^;]+);/g)) {
          const px = smallestPx(d[1]!)
          if (px != null && px < FLOOR) offenders.push(`${relative(ROOT, file)}: ${rule.selector} → ${d[1]!.trim()} (${px}px)`)
        }
      }
    }
    expect(offenders, 'use max(16px, …) so iOS does not zoom on focus').toEqual([])
  })
})

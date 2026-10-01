/**
 * The motion constants and `tokens.css` must say the same thing, and every
 * `motion` call site must use them rather than its own numbers — which is how
 * the app ended up moving at four different speeds.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DUR, DUR_FAST, DUR_SLOW, EASE } from './motion'

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

/** The value of a custom property in the `:root` block (the light-mode one). */
function token(name: string): string {
  const m = tokens.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`${name} is not in tokens.css`)
  return m[1]!.trim()
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('motion tokens', () => {
  it('the seconds match --dur-fast, --dur and --dur-slow', () => {
    expect(token('--dur-fast')).toBe(`${DUR_FAST * 1000}ms`)
    expect(token('--dur')).toBe(`${DUR * 1000}ms`)
    expect(token('--dur-slow')).toBe(`${DUR_SLOW * 1000}ms`)
  })

  it('the curve matches --ease', () => {
    expect(token('--ease')).toBe(`cubic-bezier(${EASE.join(', ')})`)
  })

  it('every duration is inside the documented 150–250ms', () => {
    for (const d of [DUR_FAST, DUR, DUR_SLOW]) expect(d).toBeGreaterThanOrEqual(0.15)
    for (const d of [DUR_FAST, DUR, DUR_SLOW]) expect(d).toBeLessThanOrEqual(0.25)
  })

  it('no screen hard-codes a duration, a curve or a spring', () => {
    const src = join(new URL('..', import.meta.url).pathname)
    const offenders: string[] = []
    for (const file of walk(src)) {
      if (!file.endsWith('.tsx') || file.endsWith('motion.test.ts')) continue
      const text = readFileSync(file, 'utf8')
      const rel = file.slice(src.length)
      // A spring has no duration at all, so it can never match the tokens.
      if (/type:\s*'spring'/.test(text)) offenders.push(`${rel}: spring`)
      // `duration: 0.4` and friends, inside a transition.
      for (const m of text.matchAll(/duration:\s*([\d.]+)/g)) offenders.push(`${rel}: duration ${m[1]}`)
      // The raw bezier, which should come from EASE.
      if (/ease:\s*\[0\.2,\s*0,\s*0,\s*1\]/.test(text)) offenders.push(`${rel}: inline ease`)
    }
    expect(offenders).toEqual([])
  })

  it('every animated element names its transition (MOT-01)', () => {
    // With no `transition`, Motion falls back to its own defaults: an
    // underdamped spring for x/y/scale (a 12% overshoot on Ceremonia) and a
    // 0.3 s fade, neither of them a token.
    const src = join(new URL('..', import.meta.url).pathname)
    const offenders: string[] = []
    for (const file of walk(src)) {
      if (!file.endsWith('.tsx')) continue
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/<motion\.\w+\b/g)) {
        // The opening tag runs to the first `>` outside braces.
        let depth = 0
        let end = m.index! + m[0].length
        for (; end < text.length; end++) {
          const c = text[end]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) break
        }
        const tag = text.slice(m.index!, end)
        if (/\b(initial|animate|exit)=/.test(tag) && !/\btransition=/.test(tag)) {
          offenders.push(`${file.slice(src.length)}:${text.slice(0, m.index!).split('\n').length}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

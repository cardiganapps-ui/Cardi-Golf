/**
 * The motion constants and `tokens.css` must say the same thing, and every
 * `motion` call site must use them rather than its own numbers — which is how
 * the app ended up moving at four different speeds.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { DRAW_STEP, DUR, DUR_BOARD, DUR_FAST, DUR_SLOW, EASE, EASE_BOARD, HAT_STEP, MOMENT, REVEAL } from './motion'

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')

/** The value of a custom property in the `:root` block (the light-mode one). */
function token(name: string): string {
  const m = tokens.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`${name} is not in tokens.css`)
  return m[1]!.trim()
}

/**
 * The `mode` of every <AnimatePresence> in a file, read from the parsed JSX
 * rather than a pattern: a string, a constant naming one (`as const`
 * included), either branch of a `?:`. A mode that can't be read statically
 * (a spread, a call, a prop) comes back as `null`, so a check fails safe.
 */
function presenceModes(source: string): Array<{ line: number; modes: Array<string | null> }> {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const consts = new Map<string, ts.Expression>()
  const out: Array<{ line: number; modes: Array<string | null> }> = []
  const values = (e: ts.Expression | undefined, seen = new Set<string>()): Array<string | null> => {
    if (!e) return [null]
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) return values(e.expression, seen)
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text]
    if (ts.isConditionalExpression(e)) return [...values(e.whenTrue, seen), ...values(e.whenFalse, seen)]
    if (ts.isIdentifier(e) && consts.has(e.text) && !seen.has(e.text)) return values(consts.get(e.text), new Set([...seen, e.text]))
    return [null]
  }
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isVariableDeclarationList(node.parent) && node.parent.flags & ts.NodeFlags.Const) {
      consts.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  const find = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === 'AnimatePresence') {
      const modes: Array<string | null> = []
      for (const attr of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attr)) modes.push(null)
        else if (attr.name.getText(file) === 'mode') {
          const init = attr.initializer
          modes.push(...(!init ? [null] : ts.isStringLiteral(init) ? [init.text] : ts.isJsxExpression(init) ? values(init.expression) : [null]))
        }
      }
      out.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, modes })
    }
    ts.forEachChild(node, find)
  }
  find(file)
  return out
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('motion tokens', () => {
  it('the seconds match --dur-fast, --dur, --dur-slow and --dur-board', () => {
    expect(token('--dur-fast')).toBe(`${DUR_FAST * 1000}ms`)
    expect(token('--dur')).toBe(`${DUR * 1000}ms`)
    expect(token('--dur-slow')).toBe(`${DUR_SLOW * 1000}ms`)
    expect(token('--dur-board')).toBe(`${DUR_BOARD * 1000}ms`)
  })

  it('the curves match --ease and --ease-board', () => {
    expect(token('--ease')).toBe(`cubic-bezier(${EASE.join(', ')})`)
    expect(token('--ease-board')).toBe(`cubic-bezier(${EASE_BOARD.join(', ')})`)
  })

  it('--ease is an ease-out: the first frame after a tap already moves (MOT-13)', () => {
    // The progress of a cubic-bezier at time x, by bisection on its x(t).
    const at = ([x1, y1, x2, y2]: readonly number[], x: number) => {
      const b = (p1: number, p2: number, t: number) => 3 * p1 * t * (1 - t) ** 2 + 3 * p2 * t ** 2 * (1 - t) + t ** 3
      let lo = 0
      let hi = 1
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        if (b(x1!, x2!, mid) < x) lo = mid
        else hi = mid
      }
      return b(y1!, y2!, (lo + hi) / 2)
    }
    const frame = 1000 / 60
    // It leaves at speed: steeper than linear at the start, and never past its end.
    expect(EASE[1] / EASE[0]).toBeGreaterThan(1)
    for (let x = 0.05; x < 1; x += 0.05) expect(at(EASE, x)).toBeLessThanOrEqual(1)
    // A quarter of the way or more on the first frame of a --dur move (the old ease-in-out managed a tenth).
    expect(at(EASE, frame / (DUR * 1000))).toBeGreaterThanOrEqual(0.25)
    expect(at([0.2, 0, 0, 1], frame / (DUR * 1000))).toBeLessThan(0.11)
  })

  it('each surface keeps its own range (MOT-11)', () => {
    // The phone: 150–250 ms, a tap confirmed.
    for (const d of [DUR_FAST, DUR, DUR_SLOW]) expect(d).toBeGreaterThanOrEqual(0.15)
    for (const d of [DUR_FAST, DUR, DUR_SLOW]) expect(d).toBeLessThanOrEqual(0.25)
    // The board surface, seen from across a room: 400–600 ms.
    expect(DUR_BOARD).toBeGreaterThanOrEqual(0.4)
    expect(DUR_BOARD).toBeLessThanOrEqual(0.6)
    // A moment begins every part of itself within 1.2 s: the champion's trophy line, a pair of the draw (its
    // faces meet over the board's time), a lot out of the hat.
    expect(MOMENT).toBeLessThanOrEqual(1.2)
    expect(REVEAL.trophy).toBeLessThanOrEqual(MOMENT)
    expect(DUR_BOARD).toBeLessThanOrEqual(DRAW_STEP)
    expect(DRAW_STEP).toBeLessThanOrEqual(MOMENT)
    expect(HAT_STEP).toBeLessThanOrEqual(MOMENT)
  })

  it('reduced motion stops the board too', () => {
    const reduced = tokens.slice(tokens.indexOf('prefers-reduced-motion'))
    for (const name of ['--dur-fast', '--dur', '--dur-slow', '--dur-board']) expect(reduced).toMatch(new RegExp(`${name}:\\s*0ms`))
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
      // The raw bezier, which should come from EASE (the one it replaced too).
      for (const curve of [EASE, [0.2, 0, 0, 1]]) {
        if (new RegExp(`ease:\\s*\\[${curve.map((n) => String(n).replace('.', '\\.')).join(',\\s*')}\\]`).test(text)) offenders.push(`${rel}: inline ease`)
      }
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
  it('the show surfaces never go blank between views (MOT-01)', () => {
    // `mode="wait"` takes the last view out before the next comes in: the TV
    // showed an empty board for 0.2 s at every rotation. The next view comes
    // in while the last one leaves.
    const screens = join(new URL('../screens/tournament', import.meta.url).pathname)
    // However it is written: mode="wait", mode={'wait'}, a constant, after an arrow-function prop. A mode
    // the parse can't read (null) counts too: it has to be shown not to be "wait".
    const offenders = ['TvScreen.tsx', 'CeremonyScreen.tsx'].flatMap((f) =>
      presenceModes(readFileSync(join(screens, f), 'utf8'))
        .filter((p) => p.modes.some((m) => m !== 'popLayout' && m !== 'sync'))
        .map((p) => `${f}:${p.line} ${JSON.stringify(p.modes)}`),
    )
    expect(offenders).toEqual([])
    // Both screens do animate between views (an empty list would pass anything).
    for (const f of ['TvScreen.tsx', 'CeremonyScreen.tsx']) expect(presenceModes(readFileSync(join(screens, f), 'utf8')).length, f).toBeGreaterThan(0)
  })

  it('the presence check reads every way of writing a mode', () => {
    const modes = (jsx: string) => presenceModes(jsx).flatMap((p) => p.modes)
    expect(modes('const a = <AnimatePresence mode="wait" />')).toEqual(['wait'])
    expect(modes("const a = <AnimatePresence mode={'wait'}>x</AnimatePresence>")).toEqual(['wait'])
    expect(modes('const a = <AnimatePresence mode={`wait`} />')).toEqual(['wait'])
    expect(modes("const WAIT = 'wait' as const\nconst a = <AnimatePresence mode={WAIT} />")).toEqual(['wait'])
    expect(modes("const W = 'wait'\nconst M = W\nconst a = <AnimatePresence mode={M} />")).toEqual(['wait'])
    expect(modes('const a = <AnimatePresence onExitComplete={() => undefined} mode="wait" />')).toEqual(['wait'])
    expect(modes("const a = <AnimatePresence initial={false} mode={tv ? 'popLayout' : 'wait'} />")).toEqual(['popLayout', 'wait'])
    expect(modes('const a = <AnimatePresence {...props} />')).toEqual([null])
    expect(modes('const a = <AnimatePresence mode={pick()} />')).toEqual([null])
    expect(modes('const a = <AnimatePresence mode="popLayout" initial={false} />')).toEqual(['popLayout'])
    expect(modes('const a = <AnimatePresence initial={false} />')).toEqual([])
  })
})

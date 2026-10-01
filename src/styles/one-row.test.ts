/**
 * One list row, one truncation convention.
 *
 * Every list in this app is the same object — something on the left, a title
 * with a line under it, a figure or a control on the right — and every screen
 * used to draw its own. Five stylesheets held near-identical `.row` rules
 * differing only in `min-height` (56, 60, 64), in padding, and in which of
 * them remembered `min-width: 0` and the ellipsis. Measured in a browser at
 * 360px across eleven screens, that was seventeen different row heights, the
 * tallest being rows whose second line had wrapped — which is what "nothing
 * is quite flush and text spills to a second line" is.
 *
 * The rules now live once in `primitives.module.css` and screens `composes:`
 * them. These two tests keep it that way.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = new URL('..', import.meta.url).pathname
const PRIMITIVES = 'components/primitives.module.css'

/**
 * Things that look like a list row to the heuristic below — a rule under them
 * and a row-ish height — and are not one. Each needs a reason; the list is
 * meant to stay this short.
 */
const NOT_A_ROW = new Set([
  // The tournament's sticky header. One of them, not a list.
  'screens/tournament/TournamentShell.module.css .top',
])

function sheets(): Array<{ path: string; text: string }> {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : []
    })
  return walk(SRC).map((p) => ({ path: p.slice(SRC.length), text: readFileSync(p, 'utf8') }))
}

/** Every `selector { ... }` rule in a stylesheet, without comments or at-rule wrappers. */
function rules(text: string): Array<{ selector: string; body: string }> {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Array<{ selector: string; body: string }> = []
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // A selector picks up whatever preceded it, so keep only its own last line.
    const selector = m[1]!.trim().split('\n').pop()!.trim()
    if (!selector || selector.startsWith('@')) continue
    out.push({ selector, body: m[2]! })
  }
  return out
}

describe('one list row', () => {
  it('only the primitives declare a list row geometry', () => {
    // A row is a line with a rule under it and a row-ish height. Anywhere but
    // the primitives, that means a screen has drawn its own instead of
    // composing `rowLine`.
    const offenders: string[] = []
    for (const { path, text } of sheets()) {
      if (path === PRIMITIVES) continue
      for (const { selector, body } of rules(text)) {
        if (!/border-bottom:\s*var\(--hairline\)/.test(body)) continue
        const h = body.match(/min-height:\s*(\d+)px/)
        if (h && Number(h[1]) >= 48 && Number(h[1]) <= 72 && !NOT_A_ROW.has(`${path} ${selector}`)) {
          offenders.push(`${path} ${selector}: min-height ${h[1]}px — compose rowLine instead`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('an ellipsis is never declared without the two rules that make it work', () => {
    // `text-overflow: ellipsis` does nothing without `overflow: hidden`, and
    // nothing useful without `white-space: nowrap` (or a line clamp). Half of
    // the app's truncation was decorative for exactly this reason.
    const offenders: string[] = []
    for (const { path, text } of sheets()) {
      for (const { selector, body } of rules(text)) {
        if (!/text-overflow:\s*ellipsis/.test(body)) continue
        const hidden = /overflow:\s*hidden/.test(body)
        const bounded = /white-space:\s*nowrap/.test(body) || /line-clamp/.test(body)
        if (!hidden || !bounded) offenders.push(`${path} ${selector}: ellipsis without ${!hidden ? 'overflow:hidden' : 'white-space:nowrap'}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('a class that composes a primitive never re-declares what the primitive sets', () => {
    // Both rules are one class, so whichever the bundle puts last wins. A
    // screen's `display: grid` on a composed `rowLine` lost to its
    // `display: flex` on every money list, and nothing said so (VIS-01). To
    // change a primitive's value, compose another primitive or use a
    // selector with two classes.
    const decls = (body: string) =>
      new Map(
        body
          .split(';')
          .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()] as const)
          .filter(([prop]) => prop),
      )
    const primitives = new Map<string, Map<string, string>>()
    for (const { selector, body } of rules(sheets().find((s) => s.path === PRIMITIVES)!.text)) {
      if (/^\.[\w-]+$/.test(selector)) primitives.set(selector.slice(1), decls(body))
    }
    const offenders: string[] = []
    for (const { path, text } of sheets()) {
      for (const { selector, body } of rules(text)) {
        const own = decls(body)
        const composes = own.get('composes')
        if (!composes?.includes('primitives.module.css')) continue
        for (const name of composes.split(/\s+from\s+/)[0]!.split(/\s+/)) {
          for (const [prop, value] of own) {
            const base = primitives.get(name)?.get(prop)
            if (prop !== 'composes' && base !== undefined && base !== value) offenders.push(`${path} ${selector}: ${prop}: ${value} re-declares ${name} (${prop}: ${base})`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the shared row rules exist and carry what everyone kept forgetting', () => {
    const text = sheets().find((s) => s.path === PRIMITIVES)!.text
    const byName = new Map(rules(text).map((r) => [r.selector, r.body]))
    // The text block must shrink, or it shoves the trailing figure off the row.
    expect(byName.get('.rowTextBlock')).toMatch(/min-width:\s*0/)
    // Both lines truncate the same way.
    for (const n of ['.rowTitleText', '.rowSubText']) {
      expect(byName.get(n), n).toMatch(/text-overflow:\s*ellipsis/)
      expect(byName.get(n), n).toMatch(/white-space:\s*nowrap/)
    }
    // One height, from the token.
    expect(byName.get('.rowLine')).toMatch(/min-height:\s*var\(--row-h\)/)
  })
})
